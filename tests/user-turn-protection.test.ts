import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { guardedSurfaceSeqsOf } from '../src/region.ts'
import { protectedRowRejectionNote } from '../src/tools.ts'

test('User Turn Protection (Recent X turns retained)', async (t) => {
  await t.test('acp-kernel distribution has Patch A3 applied', () => {
    const kernelPath = join(
      process.cwd(),
      'node_modules',
      'acp-kernel',
      'dist',
      'index.js',
    )
    const code = readFileSync(kernelPath, 'utf8')

    assert.ok(
      code.includes('maxUserTurns = config.preserveUserTurns ?? 3'),
      'Patch A3: acp-kernel should check preserveUserTurns',
    )
    assert.ok(
      code.includes('userTurnCount++'),
      'Patch A3: acp-kernel should track userTurnCount',
    )
  })

  await t.test('guardedSurfaceSeqsOf protects the last 3 real user turns even after "请继续"', () => {
    // Simulate a conversation history where user asked questions and then sent "请继续"
    const events: Record<number, SessionEvent> = {
      1: {
        type: 'user/message',
        seq: 1,
        time: 1000,
        data: { content: [{ type: 'text', text: 'Turn 1: 最初的需求' }], source: { kind: 'user' } },
      } as unknown as SessionEvent,
      2: {
        type: 'assistant/message',
        seq: 2,
        time: 1001,
        data: { message: { content: [{ type: 'text', text: 'Turn 1 回复' }] } },
      } as unknown as SessionEvent,
      3: {
        type: 'user/message',
        seq: 3,
        time: 1002,
        data: { content: [{ type: 'text', text: 'Turn 2: 核心深度架构问题' }], source: { kind: 'user' } },
      } as unknown as SessionEvent,
      4: {
        type: 'assistant/message',
        seq: 4,
        time: 1003,
        data: { message: { content: [{ type: 'text', text: 'Turn 2 回复' }] } },
      } as unknown as SessionEvent,
      5: {
        type: 'user/message',
        seq: 5,
        time: 1004,
        data: { content: [{ type: 'text', text: 'Turn 3: 进一步提问' }], source: { kind: 'user' } },
      } as unknown as SessionEvent,
      6: {
        type: 'assistant/message',
        seq: 6,
        time: 1005,
        data: { message: { content: [{ type: 'text', text: 'Turn 3 回复' }] } },
      } as unknown as SessionEvent,
      7: {
        type: 'user/message',
        seq: 7,
        time: 1006,
        data: { content: [{ type: 'text', text: '请继续' }], source: { kind: 'user' } },
      } as unknown as SessionEvent,
      8: {
        type: 'assistant/message',
        seq: 8,
        time: 1007,
        data: { message: { content: [{ type: 'text', text: '正在继续...' }] } },
      } as unknown as SessionEvent,
    }

    const mockSession = {
      surface: {
        nodes: [1, 2, 3, 4, 5, 6, 7, 8],
      },
      eventAt: (seq: number) => events[seq],
      snapshotEvents: () => Object.values(events),
    } as unknown as Session

    // With preserveUserTurns = 3:
    // User turns are: seq 7 ("请继续"), seq 5 ("Turn 3"), seq 3 ("Turn 2"), seq 1 ("Turn 1")
    // The last 3 are: seq 7, seq 5, seq 3!
    const guarded = guardedSurfaceSeqsOf(mockSession, 3)

    assert.ok(guarded.has(7), 'Latest turn 7 ("请继续") must be guarded')
    assert.ok(guarded.has(5), 'Turn 5 ("Turn 3") must be guarded')
    assert.ok(guarded.has(3), 'Turn 3 ("Turn 2: 核心深度架构问题") must be guarded')
    assert.ok(!guarded.has(1), 'Turn 1 (older than 3 turns) is not guarded')
  })

  await t.test('protectedRowRejectionNote surfaces user protection message', () => {
    const events: Record<number, SessionEvent> = {
      3: {
        type: 'user/message',
        seq: 3,
        time: 1002,
        data: { content: [{ type: 'text', text: '核心问题' }], source: { kind: 'user' } },
      } as unknown as SessionEvent,
    }
    const mockSession = {
      eventAt: (seq: number) => events[seq],
      snapshotEvents: () => Object.values(events),
    } as unknown as Session

    const note = protectedRowRejectionNote(2, 4, [3], [2, 3, 4], mockSession)
    assert.ok(note.includes('protected recent user message'), `Note should mention user message protection: ${note}`)
  })
})
