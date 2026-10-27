/**
 * Host-surface type views — the ONE place this plugin names what it reads from
 * `@deepseek-ai/dsh-agent`.
 *
 * Why a view instead of the host import: `dsh-agent` is a HOST package. DSH
 * supplies it at plugin load time at whatever version the running installation
 * carries, and it is deliberately not a dependency of this repo — declaring the
 * 0.2.1 checkout as a `file:` devDependency drags its `workspace:*` graph into
 * this install, which pnpm refuses to resolve, while the registry copy this repo
 * does install (0.1.5-rc.3) already disagrees with the host on `PreStepDecision`
 * and on `Session`.
 *
 * Only the members this plugin actually reads are described, so the host `Agent`
 * stays assignable at every call site and the host signature still governs. One
 * declaration, one place to revisit when the host surface changes.
 *
 * @module billion-context-pruner/host-types
 */

import type { Session } from '@deepseek-ai/dsh-session'

/**
 * The cordis context as this plugin uses it: `get()` is typed by the host's
 * service registry, which is spread across packages this repo does not (and
 * should not) depend on. Every caller already narrows the returned value into a
 * local probe interface; this only keeps that probe reachable.
 */
export interface AcpContextLike {
  get(service: 'llm' | 'sessionProjections' | 'tokenMeter'): unknown
}

/**
 * The host `Agent` as ACP sees it — a session plus the context used to reach the
 * meter and projections that make token counting honest.
 */
export interface AcpAgentLike {
  readonly ctx: AcpContextLike
  readonly session: Session
  readonly options: { readonly provider?: string; readonly model?: string }
}
