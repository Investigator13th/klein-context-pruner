export type StripProtocol = "anthropic" | "openai" | "responses" | null;
export interface StripResult {
    body: unknown;
    removed: number;
}
/** Drop image parts from every message older than the most recent `keepRecent`.
 *  `protocol` selects the wire dialect; `null` (unparseable) is a no-op. Returns
 *  `{ body, removed }` where `body` is the input reference untouched (and
 *  `removed` is 0) when there was nothing to strip. */
export declare function stripHistoricalImages(body: unknown, protocol: StripProtocol, keepRecent: number): StripResult;
//# sourceMappingURL=strip-images.d.ts.map