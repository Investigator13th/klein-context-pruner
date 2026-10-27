/**
 * Per-doc derived features, memoized across search calls.
 *
 * A search over the compressed history re-scores the SAME immutable docs on
 * every call — compressed block summaries and folded message text never
 * change. Without this cache, every search_context call re-tokenized the
 * entire corpus (segmenter CJK pass ≈ 0.3s/MB cold) plus re-lowercased it
 * and rebuilt the bigram set for each channel: a 5MB session cost ~3s PER
 * CALL, growing linearly with session length. With the cache the corpus is
 * processed once; later searches are O(docs × query-terms).
 *
 * Keyed by doc text (immutable). Bounded by total cached source chars —
 * oldest docs are evicted when the cap is exceeded, so a long-lived
 * process serving many sessions cannot grow unboundedly. Hosts that want to
 * release the memory eagerly on session shutdown/switch can call
 * clearDocFeatures() (optional: the cap already bounds it).
 */
export interface DocFeatures {
    /** Stemmed term frequencies (BM25 channel). */
    tf: Map<string, number>;
    /** Total term count (BM25 length normalization). */
    len: number;
    /** Lower-cased text (substring + fuzzy channels). */
    lower: string;
    /** Unique char bigrams of `lower` (fuzzy channel). */
    grams: Set<string>;
}
export declare function docFeatures(text: string): DocFeatures;
/** Drop all cached features (e.g. on session shutdown/switch). */
export declare function clearDocFeatures(): void;
/**
 * Set the cache cap in source chars. Docs larger than the cap are never
 * cached. Also used by tests to exercise eviction.
 */
export declare function setDocCacheCap(chars: number): void;
/** Cache occupancy — for diagnostics. */
export declare function docCacheInfo(): {
    entries: number;
    chars: number;
};
//# sourceMappingURL=doc-cache.d.ts.map