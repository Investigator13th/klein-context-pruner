import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDynamicTailMessage,
  organizeTailPlacement,
} from '../src/tail-placement.ts'
import type { Message } from '@deepseek-ai/dsh-llm'

test('isDynamicTailMessage accurately identifies dynamic volatile messages', () => {
  // 1. time-context plugin
  const timeMsg: Message = {
    role: 'user',
    content: [{ type: 'text', text: 'Current time: 2026-10-22T14:00:00+08:00' }],
    source: { kind: 'plugin:time-context' },
  }
  assert.equal(isDynamicTailMessage(timeMsg), true, 'time-context should be dynamic')

  // 2. acp-nudge plugin
  const nudgeMsg: Message = {
    role: 'user',
    content: [{ type: 'text', text: '【系统最高优先级紧急指令：上下文熔断】' }],
    source: { kind: 'plugin:acp-nudge' },
  }
  assert.equal(isDynamicTailMessage(nudgeMsg), true, 'acp-nudge should be dynamic')

  // 3. untagged text with runtime context marker
  const untaggedRuntime: Message = {
    role: 'user',
    content: [{ type: 'text', text: '<system-reminder>Time sampled while preparing turn 14, step 1: 2026-10-22</system-reminder>' }],
  }
  assert.equal(isDynamicTailMessage(untaggedRuntime), true, 'time sample text should be dynamic')

  // 4. Stable human user prompt
  const userMsg: Message = {
    role: 'user',
    content: [{ type: 'text', text: '帮我设计一个剪枝算法' }],
    source: { kind: 'user' },
  }
  assert.equal(isDynamicTailMessage(userMsg), false, 'human user message should be stable')

  // 5. Stable tool result message
  const toolMsg: Message = {
    role: 'tool',
    content: [{ type: 'text', text: 'Build succeeded in 35ms' }],
    toolCallId: 'call_123',
  }
  assert.equal(isDynamicTailMessage(toolMsg), false, 'tool result should be stable')
})

test('organizeTailPlacement preserves stable message order and moves dynamic tokens to the tail', () => {
  const msgUser: Message = {
    role: 'user',
    content: [{ type: 'text', text: '用户主要诉求' }],
    source: { kind: 'user' },
  }
  const msgTime: Message = {
    role: 'user',
    content: [{ type: 'text', text: '14:05:00' }],
    source: { kind: 'plugin:time-context' },
  }
  const msgTool: Message = {
    role: 'tool',
    content: [{ type: 'text', text: '执行完成' }],
    toolCallId: 'call_abc',
  }
  const msgNudge: Message = {
    role: 'user',
    content: [{ type: 'text', text: 'Nudge alert' }],
    source: { kind: 'plugin:acp-nudge' },
  }

  // Interleaved input: [Time, User, Tool, Nudge]
  const input = [msgTime, msgUser, msgTool, msgNudge]
  const reordered = organizeTailPlacement(input)

  // Expected output: [User, Tool] first, [Time, Nudge] at the tail!
  assert.equal(reordered.length, 4)
  assert.equal(reordered[0], msgUser, 'stable user message should come first')
  assert.equal(reordered[1], msgTool, 'stable tool message should come second')
  assert.equal(reordered[2], msgTime, 'dynamic time message should be at tail')
  assert.equal(reordered[3], msgNudge, 'dynamic nudge message should be at tail')
})

test('organizeTailPlacement is idempotent on already sorted messages', () => {
  const msgUser: Message = {
    role: 'user',
    content: [{ type: 'text', text: 'Hello' }],
    source: { kind: 'user' },
  }
  const msgNudge: Message = {
    role: 'user',
    content: [{ type: 'text', text: 'Nudge' }],
    source: { kind: 'plugin:acp-nudge' },
  }

  const input = [msgUser, msgNudge]
  const output = organizeTailPlacement(input)
  assert.deepEqual(output, input)
})
