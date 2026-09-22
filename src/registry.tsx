import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Targets register THEMSELVES, by id.
 *
 * The walkthrough never runs a selector. `document.querySelector('#save')`
 * matching nothing is the classic tour failure, and it is silent; here an
 * unregistered target is a known state the step handles by policy.
 *
 * It holds ELEMENTS, not rects. A rect is stale the moment the page scrolls,
 * and surviving scroll is the spotlight's whole job -- so it measures live,
 * from the element, every frame the geometry can have changed.
 */
export interface TargetRegistry {
  /** Register `el` under `id`. Returns the unregister function. */
  register(id: string, el: HTMLElement): () => void;
  get(id: string): HTMLElement | undefined;
  /** Every registered id, in registration order. */
  ids(): string[];
  subscribe(listener: () => void): () => void;
  /** Bumps on every change, so `useSyncExternalStore` has a snapshot. */
  version(): number;
}

export function createTargetRegistry(): TargetRegistry {
  const targets = new Map<string, HTMLElement>();
  const listeners = new Set<() => void>();
  let version = 0;

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  return {
    register(id, el) {
      targets.set(id, el);
      notify();
      return () => {
        // Only remove what THIS registration put there. A remount can register
        // the new element before the old one's cleanup runs, and an
        // unconditional delete would then unregister the live target.
        if (targets.get(id) === el) {
          targets.delete(id);
          notify();
        }
      };
    },
    get: (id) => targets.get(id),
    ids: () => [...targets.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

const RegistryContext = createContext<TargetRegistry | null>(null);

export function TargetRegistryProvider({
  registry,
  children,
}: {
  registry: TargetRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useTargetRegistry(): TargetRegistry | null {
  return useContext(RegistryContext);
}

/**
 * The element registered under `id`, re-rendering when it mounts or unmounts.
 *
 * Reads the nearest walkthrough's registry, or the one passed -- which is how
 * `<Walkthrough>` itself reads it, since it PROVIDES the context to its
 * children and so cannot consume it.
 */
export function useTargetElement(id: string | undefined, explicit?: TargetRegistry): HTMLElement | null {
  const fromContext = useTargetRegistry();
  const registry = explicit ?? fromContext;
  const subscribe = useCallback(
    (listener: () => void) => registry?.subscribe(listener) ?? (() => {}),
    [registry],
  );
  const getSnapshot = useCallback(
    () => (registry && id ? (registry.get(id) ?? null) : null),
    [registry, id],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Register your own element as a target: `<button ref={useWalkthroughTarget("save")}>`.
 *
 * For components that render their own DOM. Returns a ref callback, so the
 * registration follows the element: a remount registers the new one.
 */
export function useWalkthroughTarget(id: string): (el: HTMLElement | null) => void {
  const registry = useTargetRegistry();
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback(
    (el: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (el && registry) cleanup.current = registry.register(id, el);
    },
    [registry, id],
  );
}

export interface WalkthroughTargetProps {
  id: string;
  children: ReactNode;
}

/**
 * Mark part of your UI as a walkthrough target without changing its layout.
 *
 * Renders a `display: contents` wrapper -- which has no box of its own -- and
 * registers its FIRST ELEMENT CHILD, the thing a person actually sees. So
 * `<Walkthrough.Target id="save"><Button>Save</Button></Walkthrough.Target>`
 * needs nothing from `Button`: no ref forwarding, no extra prop.
 *
 * The wrapper carries `data-walkthrough-target`, a stable handle for anything
 * that needs to find a target without the registry.
 */
export function WalkthroughTarget({ id, children }: WalkthroughTargetProps) {
  const registry = useTargetRegistry();
  const wrapper = useRef<HTMLSpanElement>(null);
  const registered = useRef<{ id: string; el: HTMLElement; registry: TargetRegistry; off: () => void } | null>(null);

  // No deps: the first child can change on any render (a conditional icon, a
  // swapped component). But it re-registers only when something actually
  // changed -- unregister-then-register on every render would notify every
  // subscriber twice per render of whatever holds the target.
  useLayoutEffect(() => {
    const el = wrapper.current?.firstElementChild;
    const next = registry && el instanceof HTMLElement ? el : null;
    const current = registered.current;
    if (current && current.el === next && current.id === id && current.registry === registry) return;

    current?.off();
    registered.current = next && registry ? { id, el: next, registry, off: registry.register(id, next) } : null;
  });

  useLayoutEffect(
    () => () => {
      registered.current?.off();
      registered.current = null;
    },
    [],
  );

  return (
    <span ref={wrapper} data-walkthrough-target={id} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
