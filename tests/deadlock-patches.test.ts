import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { kernelConfigFor } from '../src/config.ts'

test('kernelConfigFor guarantees minCompressRange is set to 2000 (Patch C)', () => {
  const cfg = kernelConfigFor({ modelContextLimit: 128000 })
  assert.equal(
    cfg.compress.minCompressRange,
    2000,
    'minCompressRange must be 2000 to prevent starvation on small turns',
  )
})

test('acp-kernel distribution has Patch A1/A2 and Patch D applied', () => {
  const kernelPath = join(
    process.cwd(),
    'node_modules',
    'acp-kernel',
    'dist',
    'index.js',
  )
  const code = readFileSync(kernelPath, 'utf8')

  // Patch A1: User message cuts the range
  assert.ok(
    code.includes('if (info.isUser)'),
    'Patch A1: should check if info.isUser to cut range',
  )

  // Patch A2: Exclude user messages from cur by continuing
  assert.ok(
    code.includes('if (info.isUser) continue;'),
    'Patch A2: should skip user messages with continue so they never enter cur',
  )

  // Patch D: Guard against merging across ref index gaps
  assert.ok(
    code.includes('refToIndex'),
    'Patch D: should use refToIndex mapping to detect discontinuous gaps',
  )

  // Patch B: Graceful pressure fallback injection
  assert.ok(
    code.includes('fallbackRanges'),
    'Patch B: should provide fallbackRanges under high context pressure',
  )
})
