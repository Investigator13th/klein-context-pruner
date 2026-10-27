import type { CoreMessage } from "./types.js";
/**
 * Atomic turn groups for compression integrity (#684).
 *
 * A turn is a reasoning run, the assistant text/tool-call burst that follows
 * it, and every tool-result paired (by toolCallId) to the burst's calls.
 * Strict-echo thinking providers (DeepSeek: "The `reasoning_content` in the
 * thinking mode must be passed back to the API") reject a rebuilt request
 * whose assistant tool-call turn survives without its reasoning, and every
 * OpenAI-wire provider rejects a result whose call is gone. Turns are
 * therefore atomic for folding: all members fold together, or none do.
 *
 * Grouping is adjacency-based, mirroring {@link adjustBoundariesForReasoningPairs}:
 * a reasoning run pairs with the assistant burst immediately following it.
 * Bursts without a preceding reasoning run still group with their sibling
 * calls and results. Messages belonging to no turn (user messages, system,
 * orphan reasoning, summaries) get no group — they carry no pairing
 * constraint. Groups are disjoint.
 *
 * @returns disjoint member-id arrays; a message appears in at most one group.
 */
export declare function computeTurnGroups(messages: CoreMessage[]): string[][];
//# sourceMappingURL=turn-integrity.d.ts.map