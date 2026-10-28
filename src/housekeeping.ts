/**
 * klein-context-pruner 2.0 — 智能上下文修剪网络
 * 「靶向快刀 + 阶段收纳 + 安全气囊」三级联动引擎
 * @module klein-context-pruner/housekeeping
 */

import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { defaultCountTokens } from 'acp-kernel'
import {
  extractText,
  toolCallsOf,
  toolCallIdOfResultEvent,
  buildToolCallIndex,
  surfaceEventsOf,
} from './messages.ts'

export interface JumboFilterConfig {
  readonly enabled?: boolean
  readonly thresholdTokens?: number // default: 8000
  readonly targetTools?: readonly string[] // default: ['read', 'grep', 'pwsh']
}

export interface TurnWrapUpConfig {
  readonly enabled?: boolean
  readonly thresholdTokens?: number // default: 5000
}

export interface EmergencyHardStopConfig {
  readonly hardThresholdRatio?: number // default: 0.60 (157K under 256K window)
  readonly emergencyThresholdRatio?: number // default: 0.80 (210K under 256K window)
}

export interface HousekeepingConfig {
  readonly jumboFilter?: JumboFilterConfig
  readonly turnWrapUp?: TurnWrapUpConfig
  readonly emergencyHardStop?: EmergencyHardStopConfig
}

export const DEFAULT_HOUSEKEEPING_CONFIG: Required<HousekeepingConfig> = {
  jumboFilter: {
    enabled: true,
    thresholdTokens: 8000,
    targetTools: ['read', 'grep', 'pwsh'],
  },
  turnWrapUp: {
    enabled: true,
    thresholdTokens: 5000,
  },
  emergencyHardStop: {
    hardThresholdRatio: 0.60,
    emergencyThresholdRatio: 0.80,
  },
}

export interface JumboCandidate {
  readonly toolName: string
  readonly callSeq: number
  readonly resultSeq: number
  readonly tokens: number
  readonly consumed: boolean
  readonly argsSummary?: string
}

/**
 * 第一级：大垃圾靶向快刀 (Jumbo Filter)
 * 检测单次工具输出 >= JumboThreshold (默认 8000 tokens) 且随后已经被模型消费的只读/调试工具
 */
export function detectJumboToolResults(
  session: Session,
  config?: JumboFilterConfig,
): JumboCandidate[] {
  const enabled = config?.enabled ?? DEFAULT_HOUSEKEEPING_CONFIG.jumboFilter.enabled
  if (!enabled) return []

  const threshold = config?.thresholdTokens ?? DEFAULT_HOUSEKEEPING_CONFIG.jumboFilter.thresholdTokens!
  const targetTools = new Set(config?.targetTools ?? DEFAULT_HOUSEKEEPING_CONFIG.jumboFilter.targetTools!)

  const surfaceEvents: SessionEvent[] = surfaceEventsOf(session)
  const toolNames = buildToolCallIndex(surfaceEvents)

  // 记录每个 assistant tool-call 的 seq 与 callId
  const callSeqByCallId = new Map<string, { seq: number; toolName: string; argsSummary?: string }>()
  for (const event of surfaceEvents) {
    if (event.type === 'assistant/message') {
      const content = (event.data as { message?: { content?: unknown } }).message?.content
      const calls = toolCallsOf(content)
      for (const call of calls) {
        if (call.id) {
          const name = call.name ?? toolNames.get(call.id) ?? ''
          callSeqByCallId.set(call.id, {
            seq: event.seq,
            toolName: name,
            argsSummary: typeof call.arguments === 'object' && call.arguments !== null
              ? Object.keys(call.arguments).slice(0, 2).join(',')
              : undefined,
          })
        }
      }
    }
  }

  const candidates: JumboCandidate[] = []

  for (let i = 0; i < surfaceEvents.length; i++) {
    const event = surfaceEvents[i]!
    if (event.type !== 'tool/result') continue

    const callId = toolCallIdOfResultEvent(event) ??
      (event.data as { message?: { toolCallId?: string } })?.message?.toolCallId ??
      (event.data as { toolCallId?: string })?.toolCallId
    const callInfo = callId ? callSeqByCallId.get(callId) : undefined
    const toolName = callInfo?.toolName ?? (callId ? toolNames.get(callId) : '') ?? ''

    if (!targetTools.has(toolName)) continue

    const rawText = extractText((event.data as { message?: { content?: unknown } }).message?.content ?? (event.data as { content?: unknown })?.content)
    const tokens = defaultCountTokens(rawText)
    if (tokens < threshold) continue

    // 检查消费状态：该 tool/result 之后是否有后续的 assistant/message
    let hasSubsequentAssistant = false
    for (let j = i + 1; j < surfaceEvents.length; j++) {
      if (surfaceEvents[j]!.type === 'assistant/message') {
        hasSubsequentAssistant = true
        break
      }
    }

    if (!hasSubsequentAssistant) continue

    candidates.push({
      toolName,
      callSeq: callInfo?.seq ?? event.seq,
      resultSeq: event.seq,
      tokens,
      consumed: true,
      argsSummary: callInfo?.argsSummary,
    })
  }

  return candidates
}

/**
 * 渲染靶向快刀提示词（点名目标区间，不让模型猜题）
 */
export function renderJumboFilterNudge(candidate: JumboCandidate): string {
  const kTokens = (candidate.tokens / 1000).toFixed(1)
  const argsPart = candidate.argsSummary ? ` (${candidate.argsSummary})` : ''
  return [
    `🪓 [大体积输出即时清理提示]`,
    `检测到第 ${candidate.callSeq} 步执行的 ${candidate.toolName}${argsPart} 产生了 ~${kTokens}K tokens，当前已消费完毕。`,
    `建议优先调用 compress 工具将其折叠为关键行摘要，一键释放 ~${kTokens}K 上下文：`,
    `👉 目标区间：seq ${candidate.callSeq}..${candidate.resultSeq} (~${kTokens}K tokens)`,
  ].join('\n')
}

export type WrapUpSignalKind = 'todo_completed' | 'turn_settled' | 'subagent_settled'

export interface WrapUpSignal {
  readonly kind: WrapUpSignalKind
  readonly detail?: string
}

export interface LogRangeView {
  readonly start: number
  readonly end: number
  readonly description: string
  readonly tokens: number
}

/**
 * 第二级：事情办完顺手收纳 (Turn Wrap-up Hook)
 * 检查收尾确定性信号：
 *  - 信号 A: todo_write 将某项改为 completed
 *  - 信号 B: 回合收尾，准备输出纯文本汇报（无 tool calls）
 *  - 信号 C: 子任务合流落地
 */
export function detectWrapUpSignal(session: Session): WrapUpSignal | null {
  const surfaceEvents: SessionEvent[] = surfaceEventsOf(session)
  if (surfaceEvents.length === 0) return null

  // 1. 检查最近是否有 todo_write 将任务标记为 completed
  for (let i = surfaceEvents.length - 1; i >= Math.max(0, surfaceEvents.length - 4); i--) {
    const event = surfaceEvents[i]!
    if (event.type === 'assistant/message') {
      const content = (event.data as { message?: { content?: unknown } }).message?.content
      const calls = toolCallsOf(content)
      for (const call of calls) {
        if (call.name === 'todo_write' && typeof call.arguments === 'object' && call.arguments !== null) {
          const todos = (call.arguments as { todos?: Array<{ status?: string; content?: string }> }).todos
          if (Array.isArray(todos)) {
            const hasCompleted = todos.some((t) => t?.status === 'completed')
            if (hasCompleted) {
              return { kind: 'todo_completed', detail: 'Todo item marked as completed' }
            }
          }
        }
      }
    }
  }

  // 2. 检查最后一个 assistant 消息是否为纯文本答复（无 tool-call）
  const lastEvent = surfaceEvents[surfaceEvents.length - 1]
  if (lastEvent?.type === 'assistant/message') {
    const content = (lastEvent.data as { message?: { content?: unknown } }).message?.content
    const calls = toolCallsOf(content)
    if (calls.length === 0) {
      return { kind: 'turn_settled', detail: 'Assistant responded with final text' }
    }
  }

  return null
}

/**
 * 渲染顺手收纳提示词
 */
export function renderWrapUpNudge(
  signal: WrapUpSignal,
  totalTokens: number,
  ranges: readonly LogRangeView[],
): string {
  const totalK = (totalTokens / 1000).toFixed(1)
  const rangeLines = ranges.map(
    (r) => `- seq ${r.start}..${r.end} (${r.description}, ~${(r.tokens / 1000).toFixed(1)}K)`,
  )
  return [
    `🧹 [阶段任务收尾提示]`,
    `当前阶段任务已推进完毕。过程中产生的 ~${totalK}K 探索性工具日志已无需保留全文。`,
    `请在本次回复中顺带发起一次 compress 调用，将以下过程归纳为结论，为下一轮对话腾出桌面：`,
    ...rangeLines,
  ].join('\n')
}

export type EmergencyStatus = 'safe' | 'hard_stop' | 'emergency'

export interface EmergencyEvaluation {
  readonly status: EmergencyStatus
  readonly shouldIntercept: boolean
  readonly emergency: boolean
  readonly ratio: number
}

/**
 * 第三级：硬阈值安全气囊 (Emergency Hard Stop)
 * - 60% (157K under 256K window)：硬保底线，强制拦截提示
 * - 80% (210K under 256K window)：紧急熔断线，最高优先级贴脸警报
 */
export function evaluateEmergencyHardStop(
  tokenCount: number,
  modelContextLimit: number,
  config?: HousekeepingConfig,
): EmergencyEvaluation {
  if (modelContextLimit <= 0) {
    return { status: 'safe', shouldIntercept: false, emergency: false, ratio: 0 }
  }

  const hardRatio = config?.emergencyHardStop?.hardThresholdRatio ?? DEFAULT_HOUSEKEEPING_CONFIG.emergencyHardStop.hardThresholdRatio!
  const emergencyRatio = config?.emergencyHardStop?.emergencyThresholdRatio ?? DEFAULT_HOUSEKEEPING_CONFIG.emergencyHardStop.emergencyThresholdRatio!

  const ratio = tokenCount / modelContextLimit

  if (ratio >= emergencyRatio) {
    return { status: 'emergency', shouldIntercept: true, emergency: true, ratio }
  }
  if (ratio >= hardRatio) {
    return { status: 'hard_stop', shouldIntercept: true, emergency: false, ratio }
  }
  return { status: 'safe', shouldIntercept: false, emergency: false, ratio }
}
