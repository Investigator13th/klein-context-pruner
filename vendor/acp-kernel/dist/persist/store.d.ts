/** Logger callback. Downstream routes it wherever it wants (file, stderr). */
export type PersistLogger = (level: "info" | "warn" | "error", msg: string) => void;
/**
 * On-disk record shape. The store owns the envelope (version stamp, save
 * time, id) so atomicity and discovery can rely on it; the payload schema
 * is entirely downstream-owned. `payload` must be JSON-serializable.
 */
export interface PersistedEnvelope<T> {
    version: number;
    savedAt: number;
    id: string;
    payload: T;
}
/** A legacy (pre-envelope) record adopted on load. `version`/`savedAt`
 * preserve the source record's own stamps when present. */
export interface LegacyAdoption<T> {
    id: string;
    payload: T;
    version?: number;
    savedAt?: number;
}
export interface StateStoreOptions<T> {
    /**
     * Storage root. The kernel deliberately has NO default location: the
     * downstream decides where state lives (CLI dir, XDG data dir, plugin
     * dir, temp dir in tests). All records live under this directory.
     */
    dir: string;
    /**
     * Schema version stamped into every envelope. Owned by the downstream;
     * bump it when the payload shape changes. The store itself never
     * rejects a record over its version — migration policy belongs to the
     * reader.
     */
    version: number;
    /** Debounce window for scheduleSave, ms. Default 500. */
    debounceMs?: number;
    /** Default true. When false, all writes are silent no-ops and loads
     *  return empty results. */
    enabled?: boolean;
    log?: PersistLogger;
    /**
     * Relative path (under `dir`) for a record, possibly namespaced into
     * subdirectories (e.g. `openai/host-hash.json`). Default: flat
     * `<sha256(id)[:24]>.json`.
     *
     * Because the path may depend on payload fields the store only learns
     * at write time, single-record loads resolve namespaced files only
     * after loadAll() has discovered them (or the store itself wrote
     * them). The flat default name is always checked as a fallback, so
     * downstreams using a custom relPath should call loadAll() at boot.
     */
    relPath?: (id: string, payload: T) => string;
    /**
     * Adopt records written by an older, pre-envelope schema. Receives the
     * parsed JSON of any file that failed the envelope-shape check; return
     * an adoption to load it as an envelope, or null to skip it. Adopted
     * records are re-persisted in the current envelope format on the next
     * dirty write — files migrate organically, and old files keep loading
     * (same policy billion-context's proxy used for its v1→v3 migration).
     */
    legacy?: (parsed: unknown) => LegacyAdoption<T> | null;
    /**
     * Payload validation on load. Return false to skip a record (foreign
     * schema, corrupt content). Default: envelope-shape check only
     * (string id, non-null payload).
     */
    validate?: (envelope: PersistedEnvelope<T>) => boolean;
    /**
     * Transient-write retry policy (Windows + hostile temp environments).
     * The whole write cycle — mkdir, temp write, rename — is retried with
     * exponential backoff when it fails with a TRANSIENT code: EPERM/EBUSY/
     * EACCES (a lock held by AV scan, search indexer, SMB) or ENOENT/ENOTDIR
     * (the temp file or its directory vanished between create and rename —
     * observed on CI Windows runners where a sweeper deletes freshly
     * created files under %TEMP%). The delay after attempt i is
     * min(retryBaseMs * 2^i, retryMaxMs). Defaults (6 attempts, 50ms base,
     * 1600ms cap) give a ~1.5s window per write path — long enough for most
     * locks to release, short enough not to stall a sync flush. When the
     * window is exhausted the write spills to a side file (see spillPath)
     * instead of dropping the data.
     */
    retryAttempts?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
}
/**
 * Crash-safe, debounce-coalescing JSON state store. Mechanism only — lifted
 * from billion-context's proxy SessionStore and generalized:
 *
 * - atomic writes: temp file + rename, so a crash mid-write never leaves a
 *   truncated record (readers see either the old or the new file)
 * - whole-cycle retries with exponential backoff on transient fs failures:
 *   Windows locks (EPERM/EBUSY/EACCES from AV/indexer/SMB) and vanishing
 *   files/dirs (ENOENT/ENOTDIR — a sweeper deleting fresh temp files, seen
 *   on CI Windows runners); when the window is exhausted the record spills
 *   to a side file (`<name>.fb.json`) instead of being dropped, so a lock
 *   held by AV/indexer/SMB never silently loses session data
 * - per-id serialization so concurrent writeNow calls never interleave
 *   temp-file names or reorders writes
 * - debounced scheduleSave coalesces bursts into one write; the record is
 *   built at WRITE time from a builder, so late mutations are picked up
 * - loadAll skips `.tmp-*` orphans, corrupt JSON, and records whose
 *   filename does not match their id — one bad file never blocks boot; it
 *   reconciles a canonical record against its spill by savedAt (freshest wins)
 *
 * The store never deletes a record's data. On a successful canonical write it
 * removes a now-stale spill of the SAME id (a duplicate, not distinct data).
 * Session cleanup is a downstream policy decision (kernel position: persisted
 * state should not be deleted opportunistically).
 */
export declare class StateStore<T> {
    readonly enabled: boolean;
    private readonly dir;
    private readonly version;
    private readonly debounceMs;
    private readonly log;
    private readonly legacyFn?;
    private readonly relPathFn?;
    private readonly validateFn;
    private readonly retryAttempts;
    private readonly retryBaseMs;
    private readonly retryMaxMs;
    private readonly timers;
    private readonly pending;
    private readonly writeChains;
    /** id → absolute path, populated by writes and loadAll. */
    private readonly discovered;
    /** id → cumulative write-failure count, for rate-limited alerting. */
    private readonly failCounts;
    /** Monotonic counter for unique temp filenames within a process. */
    private tmpSeq;
    constructor(opts: StateStoreOptions<T>);
    /** Debounced save. Coalesces bursts; the builder runs at write time, so
     *  the freshest state is always persisted. Never throws. */
    scheduleSave(id: string, build: () => T): void;
    /** Immediate save, serialized per id. Rejects on write failure; a
     *  failing write never breaks the chain for the next one. */
    writeNow(id: string, build: () => T): Promise<void>;
    /** Synchronous flush for one id. Used where the caller cannot await
     *  (memory eviction, sync shutdown paths). Cancels any pending debounce
     *  timer. Returns true on success, false on failure — callers that use
     *  the result to drop in-memory state must NOT drop it on failure. */
    flushSync(id: string, build: () => T): boolean;
    /** Load one record. Checks the discovered path (from a prior
     *  write/loadAll), an optional relative-path hint, and the flat default
     *  name. Returns null when absent, disabled, corrupt, or rejected by
     *  validate. The hint covers namespaced records the store has not
     *  discovered (e.g. an evicted session re-requested with its meta,
     *  where the path depends on data the store cannot reconstruct from
     *  the id alone). */
    loadSync(id: string, hint?: string): PersistedEnvelope<T> | null;
    /** Load every record under dir. Populates the discovery map (enables
     *  loadSync for namespaced relPaths). Skips corrupt files, `.tmp-*`
     *  orphans, and records whose filename does not match their id — one
     *  bad file never blocks boot. Never throws. */
    loadAll(): Promise<Map<string, PersistedEnvelope<T>>>;
    /** Whether a debounced write is pending for an id. */
    hasPending(id: string): boolean;
    /** Ids with a pending debounced write. */
    pendingIds(): string[];
    /** Flush every pending debounced write immediately, then drain in-flight
     *  writes. For graceful shutdown (SIGTERM/SIGINT). Never rejects. */
    flushAll(): Promise<void>;
    /** Cancel all pending debounced writes without flushing (tests). */
    cancelAll(): void;
    private writeInner;
    private envelope;
    /** Absolute path for a record: custom relPath (guarded against path
     *  escape) or the flat hash default. */
    private resolvePath;
    private relPathOf;
    /** Unique temp file next to the destination (same dir ⇒ same volume ⇒
     *  rename is atomic). Prefixed `.tmp-` so loadAll skips orphans. */
    private tempPath;
    private backoffMs;
    /** Side file for a record whose canonical write keeps failing: the
     *  canonical name with a `.fb` (fallback) infix, e.g. `a.json` →
     *  `a.fb.json`. One slot per id, overwritten on each spill, so a stuck
     *  lock never accumulates files. Ends in `.json` so loadAll discovers it. */
    private spillPathFor;
    /** Remove a stale spill after a successful canonical write (best-effort). */
    private removeSpill;
    private removeSpillSync;
    /** Rate-limited failure alerting: log on the first failure and at each
     *  power-of-two count (1,2,4,8,…), so a long lock yields ~log2(N) lines
     *  instead of one per write. Includes the spill path so the operator can
     *  see where the data landed. */
    private recordFailure;
    private clearFailure;
    /** Parse + validate one file. Corrupt or invalid records return null
     *  (logged) instead of throwing — load paths must never block boot. */
    private readEnvelope;
    /** Wrap a legacy (pre-envelope) record as an envelope via the `legacy`
     *  hook, then validate the adopted payload like any other. */
    private adoptLegacy;
    /** Iterative recursive walk (no readdir-recursive dependency), skipping
     *  `.tmp-*` names and non-.json files. */
    private walkJsonFiles;
}
/** Deterministic flat filename: `<sha256(id)[:24]>.json`. Truncated hash —
 *  96 bits keeps collisions unreachable for realistic id counts, and short
 *  names stay greppable. */
export declare function flatFileNameFor(id: string): string;
//# sourceMappingURL=store.d.ts.map