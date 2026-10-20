/**
 * Where an in-progress walkthrough is remembered, so it survives a page change
 * and a full reload.
 *
 * The package never picks a store (owner decision, 2026-09-22): a host hands
 * `<Walkthrough storage>` any `{ load, save }`, and localStorage is only the
 * default. Nothing here touches `window` at import or render time -- `load` and
 * `save` are called from effects, which never run on the server.
 */

/** What is remembered. One in-progress walkthrough per store. */
export interface WalkthroughProgress {
  /** The walkthrough's id. */
  walkthrough: string;
  /**
   * The step's id. Resume finds the step by id first, so reordering steps does
   * not resume on the wrong one. ABSENT means a chain handed over to this
   * walkthrough and it has not started yet: it starts (not resumes) at `index`.
   */
  step?: string;
  /** The step's index -- the fallback when `step` names no step any more. */
  index: number;
}

/**
 * A store for `WalkthroughProgress`. `load` may return a Promise (a server-
 * backed store); `save(null)` means nothing is in progress.
 *
 * `subscribe` is optional: implement it when several `<Walkthrough>`s on one
 * page share the store, so a chain can hand over to one that is already
 * mounted. The localStorage adapter implements it.
 */
export interface WalkthroughStorage {
  load(): WalkthroughProgress | null | Promise<WalkthroughProgress | null>;
  save(progress: WalkthroughProgress | null): void | Promise<void>;
  subscribe?(listener: () => void): () => void;
}

export const DEFAULT_STORAGE_KEY = "fancy-walkthrough";

/** Shape-check what came out of a store: it may be stale, foreign or hand-edited. */
export function isProgress(value: unknown): value is WalkthroughProgress {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.walkthrough === "string" &&
    typeof v.index === "number" &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    (v.step === undefined || typeof v.step === "string")
  );
}

// Same-page listeners, per key. Module-level so two adapters on one key (two
// `<Walkthrough>`s each using the default) still hear each other.
const listeners = new Map<string, Set<() => void>>();

function local(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    // Some browsers throw on ACCESS to localStorage when storage is disabled.
    return null;
  }
}

/**
 * The default store: one JSON record in `localStorage` under `key`.
 *
 * Safe on the server (it is a no-op there) and in a browser whose storage is
 * disabled or full (it degrades to remembering nothing rather than throwing).
 */
export function createLocalStorageAdapter(key: string = DEFAULT_STORAGE_KEY): WalkthroughStorage {
  return {
    load() {
      try {
        const raw = local()?.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isProgress(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(progress) {
      try {
        const store = local();
        if (!store) return;
        if (progress === null) store.removeItem(key);
        else store.setItem(key, JSON.stringify(progress));
      } catch {
        // Quota or disabled storage: forgetting is the right degradation.
      }
      for (const listener of [...(listeners.get(key) ?? [])]) listener();
    },
    subscribe(listener) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  };
}

let fallback: WalkthroughStorage | null = null;

/** The adapter `<Walkthrough>` uses when `storage` is not passed. Created lazily; touches nothing until used. */
export function defaultStorage(): WalkthroughStorage {
  return (fallback ??= createLocalStorageAdapter());
}
