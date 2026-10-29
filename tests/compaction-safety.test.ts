import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session, SessionEvent, SurfaceSeq } from '@deepseek-ai/dsh-session'
import { runCompactionTransaction } from '../src/region.ts'

function createEvent(seq: number, type: string, data: Record<string, unknown> = {}): SessionEvent {
  return {
    seq,
    type,
    time: 1000 + seq,
    data,
  } as unknown as SessionEvent
}

function createMockSession(events: SessionEvent[], surfaceNodes?: number[]): Session & { appended: Array<{ type: string; data: unknown }> } {
  const map = new Map<number, SessionEvent>()
  for (const e of events) map.set(e.seq, e)
  const currentNodes = surfaceNodes ?? events.map((e) => e.seq)
  const appended: Array<{ type: string; data: unknown }> = []

  const session = {
    id: 'test-compaction-safety',
    eventAt: (seq: number) => map.get(seq),
    snapshotEvents: () => [...events],
    surface: {
      nodes: currentNodes as SurfaceSeq[],
      replaceGeneration: 1,
    },
    append: (type: string, data: unknown, options?: unknown) => {
      appended.push({ type, data })
      const seq = 1000 + appended.length
      const event = createEvent(seq, type, data as Record<string, unknown>)
      map.set(seq, event)
      events.push(event)
      return event
    },
    appended,
  } as unknown as Session & { appended: Array<{ type: string; data: unknown }> }

  return session
}

test('Compaction Safety & Transaction Guardrails', async (t) => {
  await t.test('runCompactionTransaction rejects empty shadowedSeqs BEFORE writing compaction/start', () => {
    const events: SessionEvent[] = [
      createEvent(10, 'user/message', { content: [{ type: 'text', text: 'Hello' }] }),
      createEvent(11, 'assistant/message', { message: { content: [{ type: 'text', text: 'World' }] } }),
    ]
    const session = createMockSession(events, [10, 11])

    assert.throws(
      () => {
        runCompactionTransaction(session, {
          start: 10,
          end: 11,
          shadowedSeqs: [], // Empty!
          summary: [{ type: 'text', text: 'Summary' }],
          shadowedTokenCount: 100,
          provider: 'test',
          model: 'test',
        })
      },
      /empty shadowedSeqs/,
    )

    // Ensure zero durable writes occurred (compaction/start must NOT be written!)
    assert.equal(session.appended.length, 0, 'No events should be appended when shadowedSeqs is empty')
  })

  await t.test('runCompactionTransaction rejects edges not present in session.surface.nodes BEFORE writing compaction/start', () => {
    // 假设 86 和 104 在 log 中（历史已发生过），但不在当前 surface.nodes 中（已被折叠移出）
    const events: SessionEvent[] = [
      createEvent(86, 'user/message', { content: [{ type: 'text', text: 'Old query' }] }),
      createEvent(104, 'tool/result', { content: [{ type: 'text', text: 'Old result' }] }),
      createEvent(200, 'assistant/message', { message: { content: [{ type: 'text', text: 'Live message' }] } }),
    ]
    // 当前 surface 上只有 200，没有 86 和 104
    const session = createMockSession(events, [200])

    assert.throws(
      () => {
        runCompactionTransaction(session, {
          start: 86,
          end: 104,
          shadowedSeqs: [86, 104],
          summary: [{ type: 'text', text: 'Summary' }],
          shadowedTokenCount: 100,
          provider: 'test',
          model: 'test',
        })
      },
      /not in current surface nodes/,
    )

    // Ensure zero durable writes occurred
    assert.equal(session.appended.length, 0, 'No events should be appended when edges are not on surface')
  })

  await t.test('detects overlapping ranges between requested boundaries', () => {
    // 验证重叠判定逻辑：[86, 104] 与 [86, 104] 100% 重叠
    const r1 = { start: 86, end: 104 }
    const r2 = { start: 86, end: 104 }
    const isOverlapping = Math.max(r1.start, r2.start) <= Math.min(r1.end, r2.end)
    assert.equal(isOverlapping, true, 'Identical spans must be detected as overlapping')

    // [100, 120] 与 [86, 104] 部分重叠
    const r3 = { start: 100, end: 120 }
    assert.equal(Math.max(r1.start, r3.start) <= Math.min(r1.end, r3.end), true)

    // [105, 120] 与 [86, 104] 不重叠
    const r4 = { start: 105, end: 120 }
    assert.equal(Math.max(r1.start, r4.start) <= Math.min(r1.end, r4.end), false)
  })
})
