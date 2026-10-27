import test from 'node:test'
import assert from 'node:assert/strict'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { projectEvent, classifySurfaceEvent, isRealUserTurn } from '../src/messages.ts'
import { isGenericMemoryRecall } from '../src/matrix.ts'

test('Generic Memory Recall & Synthetic Injection Role Decoupling', async (t) => {
  await t.test('projectEvent maps real human messages to role: user', () => {
    const realUserEvent = {
      type: 'user/message',
      seq: 11,
      time: Date.now(),
      data: {
        content: [{ type: 'text', text: '克莱茵，帮我查一下杭州今天的天气' }],
        source: { kind: 'user' },
      },
    } as unknown as SessionEvent

    const projected = projectEvent(realUserEvent)
    assert.equal(projected.length, 1)
    assert.equal(projected[0]?.role, 'user')
    assert.equal(projected[0]?.id, '11')
    assert.equal(isRealUserTurn(realUserEvent), true)
  })

  await t.test('projectEvent maps OpenViking memory recall to role: system', () => {
    const memoryEvent = {
      type: 'user/message',
      seq: 10,
      time: Date.now(),
      data: {
        content: [{ type: 'text', text: '<openviking-context source="profile">\n<user-profile uri="viking://user/huangfei/memories/profile.md">\n常驻城市为杭州\n</user-profile>\n</openviking-context>' }],
        source: { kind: 'plugin:openviking-memory', plugin: 'openviking-memory', form: 'recall' },
      },
    } as unknown as SessionEvent

    assert.equal(isGenericMemoryRecall({ source: (memoryEvent.data as any).source, content: (memoryEvent.data as any).content }), true)
    assert.equal(classifySurfaceEvent(memoryEvent), 'real')
    assert.equal(isRealUserTurn(memoryEvent), false, 'Memory recall must NEVER steal protection from real user turn')

    const projected = projectEvent(memoryEvent)
    assert.equal(projected.length, 1)
    assert.equal(projected[0]?.role, 'system', 'Memory recall must be projected as role: system so kernel allows it in compressible ranges')
    assert.equal(projected[0]?.id, '10')
  })

  await t.test('projectEvent maps time-context and repeat-tool-reminder to role: system', () => {
    const timeEvent = {
      type: 'user/message',
      seq: 12,
      time: Date.now(),
      data: {
        content: [{ type: 'text', text: 'Time sampled: 2026-10-23T11:24:09+08:00' }],
        source: { kind: 'plugin:time-context', plugin: 'time-context' },
      },
    } as unknown as SessionEvent

    assert.equal(classifySurfaceEvent(timeEvent), 'real', 'time-context is real content and foldable')
    assert.equal(isRealUserTurn(timeEvent), false)

    const projected = projectEvent(timeEvent)
    assert.equal(projected.length, 1)
    assert.equal(projected[0]?.role, 'system')
  })

  await t.test('projectEvent maps compact-checkpoint to role: system', () => {
    const checkpointEvent = {
      type: 'user/message',
      seq: 99,
      time: Date.now(),
      data: {
        content: [{ type: 'text', text: '[Compressed conversation section b1: summary of prior tools]' }],
        source: { kind: 'compact-checkpoint', plugin: 'compact' },
      },
    } as unknown as SessionEvent

    assert.equal(classifySurfaceEvent(checkpointEvent), 'checkpoint')
    assert.equal(isRealUserTurn(checkpointEvent), false)

    const projected = projectEvent(checkpointEvent)
    assert.equal(projected.length, 1)
    assert.equal(projected[0]?.role, 'system')
  })

  await t.test('acp-kernel includes memory recalls in compressible ranges while protecting human user turns', async () => {
    const { createCore, createInitialState, defaultConfig } = await import('acp-kernel')
    const core = createCore()
    const state = createInitialState()
    const config = defaultConfig(128000)
    config.preserveRecentMessages = 3
    config.preserveRecentTokens = 0

    // Simulate multi-turn session events
    const events: SessionEvent[] = [
      // Turn 1
      {
        type: 'user/message',
        seq: 1,
        time: 1000,
        data: {
          content: [{ type: 'text', text: '<openviking-context source="profile">\n<user-profile uri="viking://user/huangfei/memories/profile.md">\n常驻城市为杭州\n' + '长期偏好信息 '.repeat(200) + '\n</user-profile>\n</openviking-context>' }],
          source: { kind: 'plugin:openviking-memory', plugin: 'openviking-memory' },
        },
      } as unknown as SessionEvent,
      {
        type: 'user/message',
        seq: 2,
        time: 1001,
        data: {
          content: [{ type: 'text', text: '请列出当前目录下所有测试文件' }],
          source: { kind: 'user' },
        },
      } as unknown as SessionEvent,
      {
        type: 'assistant/message',
        seq: 3,
        time: 1002,
        data: {
          message: {
            content: [
              { type: 'tool-call', id: 'call_1', name: 'glob', arguments: { pattern: 'tests/*.ts' } },
            ],
          },
        },
      } as unknown as SessionEvent,
      {
        type: 'tool/result',
        seq: 4,
        time: 1003,
        data: {
          callId: 'call_1',
          toolName: 'glob',
          content: [{ type: 'text', text: 'test1.ts\ntest2.ts\n'.repeat(300) }],
        },
      } as unknown as SessionEvent,
      {
        type: 'assistant/message',
        seq: 5,
        time: 1004,
        data: {
          message: {
            content: [{ type: 'text', text: '已为您找到全部测试文件。' }],
          },
        },
      } as unknown as SessionEvent,
      // Turn 2
      {
        type: 'user/message',
        seq: 6,
        time: 2000,
        data: {
          content: [{ type: 'text', text: '<openviking-context source="profile">\n<user-profile uri="viking://user/huangfei/memories/profile.md">\n求职偏好\n' + '偏好补充 '.repeat(200) + '\n</user-profile>\n</openviking-context>' }],
          source: { kind: 'plugin:openviking-memory', plugin: 'openviking-memory' },
        },
      } as unknown as SessionEvent,
      {
        type: 'user/message',
        seq: 7,
        time: 2001,
        data: {
          content: [{ type: 'text', text: '现在帮我统计代码行数' }],
          source: { kind: 'user' },
        },
      } as unknown as SessionEvent,
      {
        type: 'assistant/message',
        seq: 8,
        time: 2002,
        data: {
          message: {
            content: [
              { type: 'tool-call', id: 'call_2', name: 'read', arguments: { file_path: 'test1.ts' } },
            ],
          },
        },
      } as unknown as SessionEvent,
      {
        type: 'tool/result',
        seq: 9,
        time: 2003,
        data: {
          callId: 'call_2',
          toolName: 'read',
          content: [{ type: 'text', text: 'const a = 1;\n'.repeat(500) }],
        },
      } as unknown as SessionEvent,
      {
        type: 'assistant/message',
        seq: 10,
        time: 2004,
        data: {
          message: {
            content: [{ type: 'text', text: '统计完成，总共 500 行代码。' }],
          },
        },
      } as unknown as SessionEvent,
    ]

    const messages = events.flatMap(e => projectEvent(e))
    const result = core.processTurn({
      messages,
      state,
      config,
      // ProcessTurnInput requires the pipeline's token reading; the kernel never
      // derives it itself. Reuse the same estimate the plugin's call sites pass.
      tokenCount: messages.reduce(
        (sum, m) => sum + JSON.stringify(m).length / 4,
        0,
      ),
    })

    const ranges = result.nudge?.compressibleRanges ?? []
    assert.ok(ranges.length > 0, 'Should have compressible ranges')

    // Find all message IDs covered by compressible ranges
    const coveredRawIds = new Set<string>()
    for (const r of ranges) {
      const startIdx = parseInt(r.startRef.replace('m', ''), 10)
      const endIdx = parseInt(r.endRef.replace('m', ''), 10)
      for (let i = startIdx; i <= endIdx; i++) {
        const ref = `m${String(i).padStart(5, '0')}`
        const rawId = result.state.messageRefs.byRef[ref]
        if (rawId) coveredRawIds.add(rawId)
      }
    }

    // 1. Verify real user turns are NEVER included in compressible ranges (Patch A2)
    assert.equal(coveredRawIds.has('2'), false, 'Turn 1 user prompt (seq 2) must NEVER be in compressible ranges')
    assert.equal(coveredRawIds.has('7'), false, 'Turn 2 user prompt (seq 7) must NEVER be in compressible ranges')

    // 2. Verify memory recall (seq 1 or seq 6) CAN be included in compressible ranges
    const hasMemoryCovered = coveredRawIds.has('1') || coveredRawIds.has('6')
    assert.equal(hasMemoryCovered, true, 'At least one historical memory recall must be included in compressible ranges')
  })
})
