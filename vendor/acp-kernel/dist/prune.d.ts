import type { CompressionState, CoreMessage } from "./types.js";
export declare const SUMMARY_HEADER = "[Compressed conversation section]";
/**
 * The transient visible id of an active block's rendered summary message.
 * This is a VIEW-ONLY representation: it must never be persisted into
 * `effectiveMessageIds`/`directMessageIds` (the durable coverage is the
 * block's raw message ids).
 */
export declare function summaryMessageId(blockId: string): string;
export declare function isSummaryMessageId(id: string): boolean;
/**
 * True when a message is a rendered block summary (the exact shape prune
 * emits). The id prefix alone is not sufficient — a host-authored message
 * that happens to carry a reserved id must not be treated as a rendered
 * summary (it would be silently dropped from ranges or deleted by rebuild).
 */
export declare function isRenderedSummaryMessage(message: Pick<CoreMessage, "id" | "role" | "contentType">): boolean;
export interface PruneOptions {
    injectSummaries?: boolean;
}
export declare function prune(messages: CoreMessage[], state: CompressionState, options?: PruneOptions): CoreMessage[];
//# sourceMappingURL=prune.d.ts.map