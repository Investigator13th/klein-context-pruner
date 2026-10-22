/**
 * Tail Placement & Cache Friendly Orchestration
 *
 * Implements prefix cache optimization for DeepSeek and LLM providers:
 * 1. Partitions entering messages so that immutable/stable context remains at the head,
 *    while high-frequency volatile tokens (dynamic timestamps, ACP nudges, runtime snapshots)
 *    are placed at the tail of the step's message batch.
 * 2. Integrates with generic memory evaporation to ensure historical memory recalls
 *    are condensed into compact URI references upon compression.
 *
 * @module klein-context-pruner/tail-placement
 */

import type { Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { isGenericMemoryRecall, evaporateMemoryToUris } from './matrix.ts'

/**
 * Known producer kinds for dynamic/transient messages that change step-by-step
 * and should be placed at the tail of the payload to preserve the prefix cache.
 */
const DYNAMIC_PRODUCER_KINDS = new Set([
  'plugin:time-context',
  'plugin:acp-nudge',
  'plugin:klein-context-pruner-nudge',
  'time-context',
  'status-snapshot',
  'runtime-context',
])

/**
 * Check if a message is a dynamic volatile message that should be placed at the tail.
 */
export function isDynamicTailMessage(message: Message): boolean {
  const sourceKind = message.source?.kind
  if (sourceKind !== undefined) {
    if (DYNAMIC_PRODUCER_KINDS.has(sourceKind)) return true
    if (sourceKind.includes('nudge')) return true
  }

  // Also inspect text content for dynamic runtime markers if untagged
  if ('content' in message && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'text') {
        const text = part.text
        if (text.includes('Time sampled while preparing turn') || text.includes('Current runtime context')) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * Reorder a batch of entering messages for the current step:
 * Places stable/immutable user and tool messages first, followed by dynamic volatile
 * injections (time-context, nudges) at the very tail.
 *
 * This guarantees that the prefix of the message stream remains byte-for-byte identical
 * across multi-step executions in the same turn, maximizing provider prompt cache hits.
 */
export function organizeTailPlacement(messages: readonly Message[]): Message[] {
  if (messages.length <= 1) return [...messages]

  const stable: Message[] = []
  const dynamic: Message[] = []

  for (const msg of messages) {
    if (isDynamicTailMessage(msg)) {
      dynamic.push(msg)
    } else {
      stable.push(msg)
    }
  }

  return [...stable, ...dynamic]
}

export { isGenericMemoryRecall, evaporateMemoryToUris }
