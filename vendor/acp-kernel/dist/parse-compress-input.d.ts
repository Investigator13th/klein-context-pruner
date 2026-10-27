import type { CompressRangeSpec } from "./types.js";
export type CompressParseKind = "ok" | "empty-input" | "not-object" | "missing-content" | "content-not-array" | "malformed-json" | "truncated" | "no-valid-ranges";
export interface CompressParseDiagnostics {
    /** true only when at least one range was recovered. */
    ok: boolean;
    /** Why the input parsed the way it did. */
    kind: CompressParseKind;
    /** True when the winning parse came from single→double quote repair. */
    quoteSalvage?: boolean;
    /** First 800 chars of the raw string input (string inputs only). */
    rawPrefix?: string;
    /** Raw string input length (string inputs only). */
    length?: number;
    /** Top-level keys of the parsed object — catches `content` vs `ranges` drift. */
    keys?: string[];
    /** Entries dropped because they were not valid ranges. */
    invalidItems: number;
    /** One human-readable reason per dropped entry (index-prefixed). */
    invalidReasons?: string[];
}
export interface ParsedCompressInput {
    ranges: CompressRangeSpec[];
    diagnostics: CompressParseDiagnostics;
}
/**
 * Parse compress tool arguments in any host wire shape.
 *
 * Accepts a decoded object, a JSON string (possibly fenced, trailing-comma,
 * raw-newline, or double-stringified), or a truncated JSON prefix (salvage
 * mode). Invalid entries are skipped, never fatal; the reason is in
 * `diagnostics.kind`.
 */
export declare function parseCompressArgs(input: unknown, opts?: {
    callId?: string;
}): ParsedCompressInput;
//# sourceMappingURL=parse-compress-input.d.ts.map