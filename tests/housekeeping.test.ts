import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { kernelConfigFor } from '../src/config.ts'
import {
  detectJumboToolResults,
  renderJumboFilterNudge,
  detectWrapUpSignal,
  renderWrapUpNudge,
  evaluateEmergencyHardStop,
  DEFAULT_HOUSEKEEPING_CONFIG,
  type JumboCandidate,
  type WrapUpSignal,
} from '../src/housekeeping.ts'

function createEvent(seq: number, type: string, data: Record<string, unknown>): SessionEvent {
  return {
    seq,
    type,
    time: 1000 + seq,
    data,
  } as unknown as SessionEvent
}

function createSession(events: SessionEvent[]): Session {
  const map = new Map<number, SessionEvent>()
  for (const e of events) map.set(e.seq, e)
  return {
    id: 'test-session',
    eventAt: (seq: number) => map.get(seq),
    snapshotEvents: () => events,
    surface: {
      nodes: events.map((e) => e.seq),
      replaceGeneration: 1,
    },
  } as unknown as Session
}

test('Housekeeping: Jumbo Filter (靶向快刀)', async (t) => {
  await t.test('detects jumbo tool results >= 8000 tokens consumed by subsequent assistant step', () => {
    // 构造会话：
    // seq 1: user
    // seq 2: assistant call 'read'
    // seq 3: tool result with ~9000 tokens text
    // seq 4: assistant consumed and responded
    const events: SessionEvent[] = [
      createEvent(1, 'user/message', { content: [{ type: 'text', text: '读取大文件' }] }),
      createEvent(2, 'assistant/message', {
        message: {
          content: [{ type: 'tool-call', id: 'call_1', name: 'read', arguments: { file_path: 'big-file.ts' } }],
        },
      }),
      createEvent(3, 'tool/result', {
        message: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              content: [{ type: 'text', text: 'x'.repeat(36000) }], // ~9000 tokens
            },
          ],
        },
      }),
      createEvent(4, 'assistant/message', {
        message: {
          content: [{ type: 'text', text: '我已经阅读了该文件，核心逻辑如下...' }],
        },
      }),
    ]

    const session = createSession(events)
    const candidates = detectJumboToolResults(session, {
      thresholdTokens: 8000,
      targetTools: ['read', 'grep', 'pwsh'],
    })

    assert.equal(candidates.length, 1)
    const first = candidates[0]!
    assert.equal(first.toolName, 'read')
    assert.equal(first.callSeq, 2)
    assert.equal(first.resultSeq, 3)
    assert.ok(first.tokens >= 8000)
    assert.equal(first.consumed, true)

    // 测试 Nudge 渲染格式
    const nudgeText = renderJumboFilterNudge(first)
    assert.ok(nudgeText.includes('🪓 [大体积输出即时清理提示]'))
    assert.ok(nudgeText.includes('seq 2..3'))
    assert.ok(nudgeText.includes('read'))
  })

  await t.test('does not trigger if tool result is below threshold or not yet consumed', () => {
    // 场景 A: 小于 8000 tokens
    const smallEvents: SessionEvent[] = [
      createEvent(1, 'user/message', { content: [{ type: 'text', text: 'read' }] }),
      createEvent(2, 'assistant/message', {
        message: {
          content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: {} }],
        },
      }),
      createEvent(3, 'tool/result', {
        message: { toolCallId: 'c1', content: [{ type: 'text', text: 'short content' }] },
      }),
      createEvent(4, 'assistant/message', {
        message: { content: [{ type: 'text', text: 'ok' }] },
      }),
    ]
    assert.equal(detectJumboToolResults(createSession(smallEvents)).length, 0)

    // 场景 B: 虽大但刚产出，模型尚未消费（即后面没有 assistant 消息）
    const unconsumedEvents: SessionEvent[] = [
      createEvent(1, 'user/message', { content: [{ type: 'text', text: 'read' }] }),
      createEvent(2, 'assistant/message', {
        message: {
          content: [{ type: 'tool-call', id: 'c2', name: 'grep', arguments: {} }],
        },
      }),
      createEvent(3, 'tool/result', {
        message: { toolCallId: 'c2', content: [{ type: 'text', text: 'y'.repeat(40000) }] },
      }),
    ]
    assert.equal(detectJumboToolResults(createSession(unconsumedEvents)).length, 0)
  })
})

test('Housekeeping: Turn Wrap-up Hook (顺手收纳)', async (t) => {
  await t.test('detects todo_write completed signal', () => {
    const events: SessionEvent[] = [
      createEvent(1, 'assistant/message', {
        message: {
          content: [
            {
              type: 'tool-call',
              id: 'c_todo',
              name: 'todo_write',
              arguments: {
                todos: [
                  { content: '任务1', status: 'completed' },
                  { content: '任务2', status: 'in_progress' },
                ],
              },
            },
          ],
        },
      }),
      createEvent(2, 'tool/result', {
        message: { toolCallId: 'c_todo', content: [{ type: 'text', text: 'Updated todo list' }] },
      }),
      createEvent(3, 'assistant/message', {
        message: {
          content: [{ type: 'text', text: '任务1已顺利完成。' }],
        },
      }),
    ]

    const signal = detectWrapUpSignal(createSession(events))
    assert.ok(signal !== null)
    assert.equal(signal?.kind, 'todo_completed')

    const nudgeText = renderWrapUpNudge(signal!, 6500, [
      { start: 10, end: 20, description: '排查日志', tokens: 4200 },
      { start: 22, end: 25, description: '文件查阅', tokens: 2300 },
    ])
    assert.ok(nudgeText.includes('🧹 [阶段任务收尾提示]'))
    assert.ok(nudgeText.includes('seq 10..20'))
    assert.ok(nudgeText.includes('seq 22..25'))
  })

  await t.test('detects final presentation / wrap-up answer to user (no tool calls)', () => {
    const events: SessionEvent[] = [
      createEvent(1, 'user/message', { content: [{ type: 'text', text: '请汇报结果' }] }),
      createEvent(2, 'assistant/message', {
        message: {
          content: [{ type: 'text', text: '报告博士，所有指标均已达到预期。' }],
        },
      }),
    ]

    const signal = detectWrapUpSignal(createSession(events))
    assert.ok(signal !== null)
    assert.equal(signal?.kind, 'turn_settled')
  })
})

test('Housekeeping: Emergency Hard Stop (安全气囊)', () => {
  const windowLimit = 256000 // 256K 标称窗口

  // 1. 正常舒适区：< 60% (153.6K)
  const safe = evaluateEmergencyHardStop(100000, windowLimit, DEFAULT_HOUSEKEEPING_CONFIG)
  assert.equal(safe.status, 'safe')
  assert.equal(safe.shouldIntercept, false)

  // 2. 达到硬保底线：>= 60% (153.6K) 且 < 80% (204.8K)
  const hard = evaluateEmergencyHardStop(160000, windowLimit, DEFAULT_HOUSEKEEPING_CONFIG)
  assert.equal(hard.status, 'hard_stop')
  assert.equal(hard.shouldIntercept, true)
  assert.equal(hard.emergency, false)

  // 3. 达到紧急熔断线：>= 80% (204.8K)
  const emergency = evaluateEmergencyHardStop(215000, windowLimit, DEFAULT_HOUSEKEEPING_CONFIG)
  assert.equal(emergency.status, 'emergency')
  assert.equal(emergency.shouldIntercept, true)
  assert.equal(emergency.emergency, true)
})

test('Housekeeping: Config Integration with kernelConfigFor', () => {
  const cfg = kernelConfigFor({
    modelContextLimit: 256000,
    housekeeping: {
      emergencyHardStop: {
        hardThresholdRatio: 0.60,
        emergencyThresholdRatio: 0.80,
      },
    },
  })

  assert.equal(cfg.nudge?.maxContextLimitPct, 0.60, 'maxContextLimitPct should map to 0.60')
  assert.equal(cfg.nudge?.emergencyThresholdPct, 0.80, 'emergencyThresholdPct should map to 0.80')
})
