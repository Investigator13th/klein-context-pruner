import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultConfig } from 'acp-kernel'
import { kernelConfigFor } from '../src/config.ts'

const kernelDist = () => readFileSync(join(process.cwd(), 'node_modules', 'acp-kernel', 'dist', 'index.js'), 'utf8')

/**
 * Patch F — the soft trigger asks "how much headroom is LEFT", not "how much
 * did I grow since the last nudge". The upstream growth test could not tell a
 * burst paste (compress now) from a long slow session (still half empty), and
 * after a successful compress it kept the stale reference point until usage
 * fell a full growthTokens below it — so the nudge either fired far too early
 * or not at all on the way back up.
 *
 * Mirror of the kernel's resolveHeadroomTokens, kept in lockstep by the
 * assertions below (the kernel does not export it).
 */
function resolveHeadroomTokens(limit: number, nudge: ReturnType<typeof defaultConfig>['nudge']): number {
  if (!limit || limit <= 0) return nudge.headroomFloor ?? 20000
  const ratio = nudge.headroomRatio ?? 0.25
  return Math.min(nudge.headroomCap ?? 50000, Math.max(nudge.headroomFloor ?? 20000, Math.round(limit * ratio)))
}

test('Patch F: kernel dist exposes resolveHeadroomTokens and drops the growth gate', () => {
  const code = kernelDist()

  assert.ok(code.includes('function resolveHeadroomTokens'), 'Patch F: resolveHeadroomTokens must exist in the kernel dist')

  assert.ok(
    code.includes('const headroomReady = limit > 0 && tokenCount >= limit - headroomTokens;'),
    'Patch F: readiness must be a remaining-headroom test',
  )

  assert.ok(
    code.includes('const growthReady = firstSightMassReady || headroomReady;'),
    'Patch F: the soft trigger must no longer OR in the growth-since-reference test',
  )

  assert.ok(
    !code.includes('growthSinceReference >= growthFloor'),
    'Patch F: the upstream growth gate must be gone — it cannot distinguish burst from drift',
  )
})

test('Patch F: default config carries the headroom knobs', () => {
  const { nudge } = defaultConfig(131072)

  assert.equal(nudge.headroomRatio, 0.25)
  assert.equal(nudge.headroomFloor, 20000)
  assert.equal(nudge.headroomCap, 250000)
  assert.equal(nudge.maxContextLimitPct, 0.85, 'hard line must sit above the soft trigger')
})

test('Patch F: at a 128K window the three lines stay ordered 75% < 85% < 95%', () => {
  const limit = 131072
  const { nudge } = defaultConfig(limit)
  const reserve = resolveHeadroomTokens(limit, nudge)

  const soft = limit - reserve
  const hard = Math.round(limit * nudge.maxContextLimitPct)
  const emergency = Math.round(limit * nudge.emergencyThresholdPct)

  assert.equal(reserve, 32768)
  assert.equal(soft, 98304)
  assert.equal(hard, 111411)
  assert.equal(emergency, 124518)
  assert.ok(soft < hard, `soft (${soft}) must fire before the hard line (${hard})`)
  assert.ok(hard < emergency, `hard (${hard}) must fire before emergency (${emergency})`)
})

test('Patch F: the soft trigger stays ahead of the hard line at every sane window', () => {
  // headroomRatio must exceed (1 - maxContextLimitPct) or the cap drags the
  // soft trigger past the hard line (this is exactly what a 50000 cap did at 1M).
  for (const limit of [32768, 65536, 131072, 262144, 524288, 1000000]) {
    const { nudge } = defaultConfig(limit)
    const soft = limit - resolveHeadroomTokens(limit, nudge)
    const hard = Math.round(limit * nudge.maxContextLimitPct)
    assert.ok(soft < hard, `window ${limit}: soft (${soft}) must precede hard (${hard})`)
  }
})

test('Patch F: the trigger is self-suppressing — compressing flips it back off', () => {
  const limit = 131072
  const { nudge } = defaultConfig(limit)
  const reserve = resolveHeadroomTokens(limit, nudge)

  const ready = (tokens: number) => tokens >= limit - reserve

  assert.equal(ready(98303), false, 'one token under the line must stay quiet')
  assert.equal(ready(98304), true, 'exactly at the line must fire')
  // A 30K compress from the trigger point restores headroom well past 2x the
  // reserve, so the very next step is quiet again — no reference point to reset.
  assert.equal(ready(98304 - 30000), false, 'after a compress the trigger must fall silent on its own')
})

test('Patch F: an unknown window falls back to the floor instead of dividing by zero', () => {
  assert.equal(resolveHeadroomTokens(0, defaultConfig(0).nudge), 20000)
  assert.equal(resolveHeadroomTokens(-1, defaultConfig(0).nudge), 20000)
})

test('kernelConfigFor forwards the headroom ratio without clobbering the other pcts', () => {
  const cfg = kernelConfigFor({
    modelContextLimit: 131072,
    nudgeMinContextLimitPct: 0.45,
    nudgeMaxContextLimitPct: 0.85,
    nudgeEmergencyThresholdPct: 0.95,
    nudgeHeadroomRatio: 0.3,
  })

  assert.equal(cfg.nudge.headroomRatio, 0.3)
  assert.equal(cfg.nudge.minContextLimitPct, 0.45)
  assert.equal(cfg.nudge.maxContextLimitPct, 0.85)
  assert.equal(cfg.nudge.emergencyThresholdPct, 0.95)
})
