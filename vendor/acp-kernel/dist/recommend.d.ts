/**
 * Recommendation engine — compression protection + recommendation.
 *
 * Clean-room reimplementation of the recommendation algorithm (MIT, ours).
 * These pure functions answer two questions every turn:
 *
 *  1. **Protection** — which messages must NOT be compressed? (protected tools,
 *     recent messages, recent tokens)
 *  2. **Recommendation** — which remaining ranges are actually WORTH compressing?
 *     (growth-aware threshold; suppress nudges when ranges are too small)
 *
 * Called by the `recommend` pipeline node. No side effects, no state mutation.
 */
import type { CompressibleRange, Config, ContextRanges, CoreMessage } from "./types.js";
import type { CompressionState } from "./types.js";
export declare function isToolMessage(message: CoreMessage): boolean;
/**
 * Compute the set of protected message refs (mNNNNN) that form the
 * "soft-protected zone" at the tail of the conversation.
 *
 * Combines two rules:
 *   1. Last N messages (`config.preserveRecentMessages`)
 *   2. Last N tokens expanding backward (`config.preserveRecentTokens`)
 *
 * Only considers visible, non-synthetic, non-pruned messages that have refs.
 */
export declare function computeProtectedRefs(messages: CoreMessage[], state: CompressionState, config: Config, countTokens?: (text: string) => number): Set<string>;
/**
 * Build compressible and protected range groups from the message list.
 *
 * Messages are classified into:
 *   - **compressible**: normal messages outside the protected zone
 *   - **protected**: messages from protected tools (e.g., skill, task)
 *   - **skipped**: covered by blocks, synthetic, or in the protected zone
 *
 * Compressible messages are grouped into contiguous ranges. The protected
 * zone (from `computeProtectedRefs`) splits groups — the unprotected head
 * survives as its own range.
 */
export declare function buildCompressibleRanges(messages: CoreMessage[], state: CompressionState, config: Config, protectedZoneRefs?: Set<string>, countTokens?: (text: string) => number): ContextRanges;
/** Merge adjacent ranges into batches that clear `minChars` of REAL text —
 *  the same accounting `applyCompression` uses — so a recommended range is
 *  never below the threshold the kernel would atomically reject. Batching by
 *  token estimates (tokens*4) instead broke whenever the host injected a
 *  tokenizer where tokens != chars/4 (CJK-aware estimators are ~1:1, so
 *  tokens*4 overestimated size ~4x and nudge recommended ranges the apply
 *  side then refused). A sub-threshold tail batch is still emitted — callers
 *  filter by effectiveness separately (see pendingByTier). */
export declare function mergeRangesToThreshold(ranges: CompressibleRange[], minChars: number): CompressibleRange[];
//# sourceMappingURL=recommend.d.ts.map