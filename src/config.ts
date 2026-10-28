/**
 * Kernel configuration assembly — the DSH counterpart of billion-context-pi's
 * `resolveConfig`: build acp-kernel's `Config` from adapter-level knobs.
 *
 * Defaults are deliberately the acp-kernel `defaultConfig` values (the same
 * defaults billion-context-pi ships: nudge window 45%–75%, emergency 95%,
 * growth ratio 5%, protected last messages 5). Every knob is optional — an
 * omitted value keeps the kernel default, so the behavior matches the Pi
 * adapter exactly unless a deployment opts out.
 *
 * NOTE: `AcpCompactionEngine` (src/index.ts) ships its own engine-level
 * defaults 0.70/0.85 for the two nudge thresholds on top of this layer, so an
 * engine with no explicit config lands on 0.70/0.85, not 0.75/0.95.
 * @module billion-context-dsh/config
 */

import { defaultConfig, type Config } from 'acp-kernel'
import { DEFAULT_HOUSEKEEPING_CONFIG, type HousekeepingConfig } from './housekeeping.ts'

/** The kernel-facing knobs shared by the nudge path and the compress tool. */
export interface KernelConfigInput {
  readonly modelContextLimit: number
  /** Nudge window lower bound (usage fraction; validation only — the growth-driven trigger has no percentage floor). Kernel default: 0.45. */
  readonly nudgeMinContextLimitPct?: number
  /** Nudge window upper bound — over-limit guarantee line. Kernel default: 0.75. */
  readonly nudgeMaxContextLimitPct?: number
  /** Emergency nudge threshold (bypasses per-turn dedup; capped at 3 injections per user turn — issue #108). Kernel default: 0.95. */
  readonly nudgeEmergencyThresholdPct?: number
  /** Number of recent real user turns to protect from compression. Default: 3. */
  readonly preserveUserTurns?: number
  /**
   * Soft-trigger headroom reserve as a fraction of `modelContextLimit` (kernel
   * patch F). The nudge fires once `tokenCount >= limit - limit * ratio`, i.e.
   * based on REMAINING space instead of "how much grew since the last nudge".
   * Kernel default: 0.25 (128K window → reserve 32768, soft trigger at 75%).
   */
  readonly nudgeHeadroomRatio?: number
  /** Floor for the headroom reserve in absolute tokens. Kernel default: 20000. */
  readonly nudgeHeadroomFloor?: number
  /** Cap for the headroom reserve. Kernel default: 250000 — kept above 1 - maxContextLimitPct × limit at every sane window so the soft trigger never lands after the hard line. */
  readonly nudgeHeadroomCap?: number
  /**
   * Chronicle 冷区日纪要的写入目录。留空时走 `resolveChronicleDir` 的上溯
   * 回退（从 cwd 逐级找到最近的 `memory/`，再拼 `wiki/chronicle`）。
   *
   * 记忆真源跨工作区恒定，所以主工作区一旦迁移，必须在这里显式钉住绝对路径，
   * 不依赖任何 cwd 推断。
   */
  readonly chronicleDir?: string
  /** ACP 2.0 智能修剪策略（靶向快刀 + 阶段收纳 + 安全气囊） */
  readonly housekeeping?: HousekeepingConfig
  /** Any other acp-kernel Config override (the billion-context-pi escape hatch). */
  readonly coreOverrides?: Partial<Config>
}

/**
 * Assemble the kernel config: `defaultConfig(limit)` merged with the optional
 * nudge thresholds (merged into the defaults, never replacing them wholesale)
 * and any additional `coreOverrides`.
 */
export function kernelConfigFor(input: KernelConfigInput): Config {
  const nudgePatch: Partial<Config['nudge']> = {}
  if (input.nudgeMinContextLimitPct !== undefined) nudgePatch.minContextLimitPct = input.nudgeMinContextLimitPct

  const maxPct = input.nudgeMaxContextLimitPct ?? input.housekeeping?.emergencyHardStop?.hardThresholdRatio
  if (maxPct !== undefined) nudgePatch.maxContextLimitPct = maxPct

  const emergencyPct = input.nudgeEmergencyThresholdPct ?? input.housekeeping?.emergencyHardStop?.emergencyThresholdRatio
  if (emergencyPct !== undefined) nudgePatch.emergencyThresholdPct = emergencyPct

  if (input.nudgeHeadroomRatio !== undefined) nudgePatch.headroomRatio = input.nudgeHeadroomRatio
  if (input.nudgeHeadroomFloor !== undefined) nudgePatch.headroomFloor = input.nudgeHeadroomFloor
  if (input.nudgeHeadroomCap !== undefined) nudgePatch.headroomCap = input.nudgeHeadroomCap

  const overrides: Partial<Config> & { preserveUserTurns?: number } = {
    compress: {
      ...defaultConfig(input.modelContextLimit).compress,
      minCompressRange: 2000,
      ...input.coreOverrides?.compress,
    },
    ...input.coreOverrides,
  }
  if (input.preserveUserTurns !== undefined) {
    overrides.preserveUserTurns = input.preserveUserTurns
  }
  if (Object.keys(nudgePatch).length > 0 || input.coreOverrides?.nudge) {
    // The engine always ships explicit pct defaults (0.70/0.85, see
    // DEFAULT_CONFIG), so nudgePatch is never empty and the plain replace
    // below used to discard coreOverrides.nudge entirely — the documented
    // escape hatch was unreachable whenever the pct knobs were set. User
    // overrides must land LAST so they win over both kernel defaults and
    // the engine pct values.
    overrides.nudge = {
      ...defaultConfig(input.modelContextLimit).nudge,
      ...nudgePatch,
      ...input.coreOverrides?.nudge,
    }
  }
  return defaultConfig(input.modelContextLimit, overrides)
}
