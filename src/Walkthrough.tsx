import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  Card,
  ContentRenderer,
  Heading,
  Portal,
  Text,
  useControllableState,
  useEscapeKey,
  useFloatingPosition,
} from "@particle-academy/react-fancy";

import type { Rect } from "./geometry";
import {
  createTargetRegistry,
  TargetRegistryProvider,
  useTargetElement,
  WalkthroughTarget,
  type TargetRegistry,
} from "./registry";
import { Spotlight } from "./Spotlight";
import { defaultStorage, type WalkthroughProgress, type WalkthroughStorage } from "./storage";
import type { WalkthroughDocument, WalkthroughEvent, WalkthroughStep } from "./types";

/** Words the default card uses. Every one is replaceable. */
export interface WalkthroughLabels {
  next: string;
  back: string;
  skip: string;
  done: string;
  /** Shown on an `advanceOn: "target-click"` step instead of a Next button. */
  clickTarget: string;
  /** Shown on an `advanceOn: "event"` step. */
  waitingForEvent: string;
  /** Shown while a step's target is not mounted yet. */
  waitingForTarget: string;
  /** `{current}` and `{total}` are replaced. */
  progress: string;
}

const DEFAULT_LABELS: WalkthroughLabels = {
  next: "Next",
  back: "Back",
  skip: "Skip tour",
  done: "Done",
  clickTarget: "Click the highlighted element to continue.",
  waitingForEvent: "Complete this step to continue.",
  waitingForTarget: "Waiting for this part of the page to appear…",
  progress: "{current} of {total}",
};

/** What a custom step renderer is handed. */
export interface WalkthroughStepContext {
  step: WalkthroughStep;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  /** The step has a target that is not mounted, and its policy is to wait. */
  waitingForTarget: boolean;
  labels: WalkthroughLabels;
  next: () => void;
  back: () => void;
  skip: () => void;
}

/** What `onNavigate` is told besides the step. */
export interface WalkthroughNavigateContext {
  /** The walkthrough the step belongs to. */
  walkthrough: string;
  index: number;
}

export interface WalkthroughProps {
  /**
   * Identifies this walkthrough in every event. With `steps`, this is the
   * walkthrough's own document (spread one: `<Walkthrough {...doc}>`). May be
   * omitted when `walkthroughs` is given.
   */
  id?: string;
  steps?: WalkthroughStep[];
  /** The step whose completion is first value. See `WalkthroughDocument`. */
  firstValue?: string;
  /** The walkthrough to start when this one completes. See `WalkthroughDocument.next`. */
  next?: string;
  /**
   * A library of walkthroughs this one can chain into -- or, with no `id` /
   * `steps`, the whole set it plays. A `next` found here starts in place; one
   * that is not is handed over through `storage` to the `<Walkthrough>` that
   * has it.
   */
  walkthroughs?: WalkthroughDocument[];
  /** Controlled active walkthrough id (which one `step` indexes into). */
  walkthrough?: string;
  /** Uncontrolled starting walkthrough. Default: `id`, else the first of `walkthroughs`. */
  defaultWalkthrough?: string;
  /** Fires when the active walkthrough changes -- a chain, a resume, or `start(at, id)`. */
  onWalkthroughChange?: (walkthrough: string) => void;
  /**
   * Where in-progress state (`{ walkthrough, step, index }`) is remembered so
   * it survives navigation and reloads. Default: localStorage under
   * `"fancy-walkthrough"` (`createLocalStorageAdapter()`). `null` remembers
   * nothing. Read once, on mount.
   */
  storage?: WalkthroughStorage | null;
  /**
   * The host's current route, compared with `step.route` by plain string
   * equality. Default: `window.location.pathname`, read in an effect. Passing
   * it also lets a missing-target policy apply once the host has ARRIVED.
   */
  currentRoute?: string;
  /**
   * Called when a step with a `route` starts and the host is elsewhere. The
   * HOST navigates (`router.visit(step.route)`); the package never does, and
   * depends on no router. Called once per step entry.
   */
  onNavigate?: (step: WalkthroughStep, context: WalkthroughNavigateContext) => void;
  /** Controlled step index; `null` = not running. */
  step?: number | null;
  /** Uncontrolled starting step. Default `null` -- start it with `useWalkthrough().start()`. */
  defaultStep?: number | null;
  onStepChange?: (step: number | null) => void;
  onEvent?: (event: WalkthroughEvent) => void;
  /** Replace the default card entirely. The spotlight and positioning stay. */
  renderStep?: (context: WalkthroughStepContext) => ReactNode;
  labels?: Partial<WalkthroughLabels>;
  /** Space around the target inside the hole. Default 6. */
  padding?: number;
  /** Hole corner radius. Default 10. */
  radius?: number;
  /** Clicking the dimmed area skips the walkthrough. Default false -- a stray click should not end it. */
  dismissOnScrimClick?: boolean;
  /** Glide the spotlight between targets. Always off under `prefers-reduced-motion`. Default true. */
  animate?: boolean;
  /** Extra classes for the default card. */
  cardClassName?: string;
  /**
   * A registry from `createWalkthroughRegistry()`, shared with targets in OTHER
   * React roots (`<Walkthrough.Target registry>`, `useWalkthroughTarget(id, {
   * registry })`, `<WalkthroughTargetsProvider registry>`). Default: one of its
   * own, reachable only by targets inside it.
   */
  registry?: TargetRegistry;
  /** How every step's `body` is read, unless the step says otherwise. Default `"text"`. */
  bodyFormat?: "text" | "markdown";
  /** The app. Targets anywhere inside register with this walkthrough. */
  children?: ReactNode;
}

export interface WalkthroughApi {
  /** The running step index, or `null`. */
  step: number | null;
  current: WalkthroughStep | null;
  /** The active walkthrough's id -- the one `step` indexes into. */
  walkthrough: string | null;
  /** Start, optionally at an index, optionally a named walkthrough from the library. */
  start: (at?: number, walkthrough?: string) => void;
  next: () => void;
  back: () => void;
  /** End it early. Reported as `abandoned`. */
  skip: () => void;
  /**
   * Tell the walkthrough something happened in the app. Advances the current
   * step when it is `advanceOn: "event"` with this `event`.
   */
  signal: (event: string) => void;
  registry: TargetRegistry;
}

const WalkthroughContext = createContext<WalkthroughApi | null>(null);

/** Drive the nearest `<Walkthrough>` from anywhere inside it. */
export function useWalkthrough(): WalkthroughApi {
  const api = useContext(WalkthroughContext);
  if (!api) throw new Error("useWalkthrough() must be used inside <Walkthrough>.");
  return api;
}

// `auto` / `auto-complete` / `auto-chain`: moved on by the `whenMissing:
// "skip"` policy. A step skipped because its target never mounted was not
// completed, so none of them counts toward first value. `chain` is the person
// finishing a walkthrough whose `next` starts in place; `resume` is progress
// read back from storage; `handover` is a chain arriving from ELSEWHERE.
type Reason =
  | "next"
  | "back"
  | "skip"
  | "complete"
  | "auto"
  | "auto-complete"
  | "chain"
  | "auto-chain"
  | "error"
  | "start"
  | "resume"
  | "handover";

function devWarn(message: string): void {
  // Read through globalThis: a browser has no `process`, and a bundler that
  // replaces `process.env.NODE_ENV` still sees the same expression.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (env !== "production" && typeof console !== "undefined") console.warn(`[fancy-walkthrough] ${message}`);
}

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/** Where a stored record lands in `doc`, or -1. The step id wins; the index is the fallback. */
function resolveIndex(doc: WalkthroughDocument, progress: WalkthroughProgress): number {
  if (progress.step !== undefined) {
    const byId = doc.steps.findIndex((s) => s.id === progress.step);
    if (byId >= 0) return byId;
  }
  return progress.index < doc.steps.length ? progress.index : -1;
}

/**
 * A guided walkthrough over your app.
 *
 * Steps are JSON; targets register themselves with `<Walkthrough.Target>` or
 * `useWalkthroughTarget`; the step index is controlled (`step` +
 * `onStepChange`) so a host, a router or an agent can read and move it.
 *
 * Walkthroughs chain (`next`), steps can live on other pages (`step.route` +
 * `onNavigate` -- the HOST navigates), and in-progress state survives
 * navigation and reloads through `storage`.
 *
 * The card is a NON-modal dialog on purpose. A focus trap would stop the
 * person reaching the very element an `advanceOn: "target-click"` step asks
 * them to use. Focus moves to the card on each step so it is announced, and
 * Escape ends the walkthrough.
 */
function WalkthroughRoot({
  id,
  steps,
  firstValue,
  next: nextWalkthrough,
  walkthroughs,
  walkthrough: controlledWalkthrough,
  defaultWalkthrough,
  onWalkthroughChange,
  storage,
  currentRoute,
  onNavigate,
  step: controlledStep,
  defaultStep = null,
  onStepChange,
  onEvent,
  renderStep,
  labels: labelOverrides,
  padding = 6,
  radius = 10,
  dismissOnScrimClick = false,
  animate = true,
  cardClassName,
  registry: sharedRegistry,
  bodyFormat = "text",
  children,
}: WalkthroughProps) {
  const [ownRegistry] = useState(createTargetRegistry);
  const registry = sharedRegistry ?? ownRegistry;

  // Every walkthrough this one can play: its own document first, then the
  // library. A library entry sharing the own id is shadowed by it.
  const library = useMemo<WalkthroughDocument[]>(() => {
    const own: WalkthroughDocument[] = id !== undefined && steps ? [{ id, steps, firstValue, next: nextWalkthrough }] : [];
    return [...own, ...(walkthroughs ?? []).filter((d) => d.id !== id)];
  }, [id, steps, firstValue, nextWalkthrough, walkthroughs]);

  const onWalkthroughChangeRef = useRef(onWalkthroughChange);
  onWalkthroughChangeRef.current = onWalkthroughChange;
  const reportWalkthrough = useCallback((value: string | undefined) => {
    if (value !== undefined) onWalkthroughChangeRef.current?.(value);
  }, []);
  const [activeId, setActiveId] = useControllableState<string | undefined>(
    controlledWalkthrough,
    defaultWalkthrough ?? id ?? walkthroughs?.[0]?.id,
    reportWalkthrough,
  );
  const [index, setIndex] = useControllableState<number | null>(controlledStep, defaultStep, onStepChange);

  const doc = library.find((d) => d.id === activeId) ?? null;
  const docSteps = doc?.steps;
  const stepCount = docSteps?.length ?? 0;

  // The store is read once, on mount: a host passing an inline `{ load, save }`
  // must not re-trigger a load on every render. `undefined` = the default.
  const [store] = useState<WalkthroughStorage | null>(() => (storage === undefined ? defaultStorage() : storage));
  // Nothing runs, and nothing is reported, until the store has been read --
  // otherwise a resumed walkthrough would first report `started` at
  // `defaultStep`. Without a store there is nothing to wait for.
  const [ready, setReady] = useState(store === null);

  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const current = ready && docSteps && index !== null && index >= 0 && index < docSteps.length ? docSteps[index] : null;
  const running = current !== null;
  const stepKey = running ? `${activeId}#${index}` : null;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const emit = useCallback((event: WalkthroughEvent) => onEventRef.current?.(event), []);

  // Why the NEXT index change happened. Set by our own handlers; a change that
  // arrives without one came from the host or an agent (controlled mode). It
  // is reported as a step change -- or, to null, as an abandonment -- but never
  // as first value: moving the walkthrough on is not the person doing the thing.
  const reason = useRef<Reason | null>(null);

  const go = useCallback(
    (next: number | null, why: Reason) => {
      reason.current = why;
      setIndex(next);
    },
    [setIndex],
  );

  // Finish the active walkthrough: chain into `next` in place when the library
  // has it, otherwise end (and the transition effect hands `next` over).
  const finish = useCallback(
    (byPerson: boolean) => {
      const to = doc?.next;
      const target = to !== undefined && to !== doc?.id ? library.find((d) => d.id === to) : undefined;
      if (target && target.steps.length > 0) {
        setActiveId(target.id);
        go(0, byPerson ? "chain" : "auto-chain");
      } else {
        go(null, byPerson ? "complete" : "auto-complete");
      }
    },
    [doc, library, go, setActiveId],
  );

  const start = useCallback(
    (at = 0, walkthrough?: string) => {
      if (walkthrough !== undefined && walkthrough !== activeId) {
        if (!library.some((d) => d.id === walkthrough)) {
          devWarn(`start(): no walkthrough "${walkthrough}" in this <Walkthrough>.`);
          return;
        }
        setActiveId(walkthrough);
        go(at, "start");
      } else if (index !== at) {
        go(at, "start");
      }
    },
    [go, index, activeId, library, setActiveId],
  );
  const next = useCallback(() => {
    if (index === null) return;
    if (index >= stepCount - 1) finish(true);
    else go(index + 1, "next");
  }, [go, finish, index, stepCount]);
  const back = useCallback(() => {
    if (index !== null && index > 0) go(index - 1, "back");
  }, [go, index]);
  const skip = useCallback(() => {
    if (index !== null) go(null, "skip");
  }, [go, index]);

  // Events are derived from the TRANSITION, not emitted by the handlers, so a
  // host moving `step` itself is reported exactly like a click would be. The
  // transition is (walkthrough, index): a chain changes both at once.
  const previous = useRef<{ walkthrough: string | undefined; index: number | null }>({ walkthrough: undefined, index: null });
  useEffect(() => {
    if (!ready) return;
    const prev = previous.current;
    previous.current = { walkthrough: activeId, index };
    const why = reason.current;
    reason.current = null;
    if (prev.walkthrough === activeId && prev.index === index) return;

    const prevDoc = library.find((d) => d.id === prev.walkthrough) ?? null;
    const prevIndex = prev.index;
    const prevValid = prevDoc !== null && prevIndex !== null && prevIndex >= 0 && prevIndex < prevDoc.steps.length;
    const curValid = doc !== null && index !== null && index >= 0 && index < doc.steps.length;
    const sameDoc = prevDoc !== null && doc !== null && prevDoc.id === doc.id;
    let handover: string | undefined;

    // The previous walkthrough ended: its index went to null, or a chain (or
    // `start(at, id)`) replaced it.
    if (prevValid && (!curValid || !sameDoc)) {
      const prevStep = prevDoc.steps[prevIndex];
      const completed = why === "complete" || why === "auto-complete" || why === "chain" || why === "auto-chain";
      if (completed) {
        if ((why === "complete" || why === "chain") && prevDoc.firstValue === prevStep.id) {
          emit({ type: "walkthrough:first-value", walkthrough: prevDoc.id, step: prevStep.id });
        }
        emit(
          prevDoc.next !== undefined
            ? { type: "walkthrough:completed", walkthrough: prevDoc.id, next: prevDoc.next }
            : { type: "walkthrough:completed", walkthrough: prevDoc.id },
        );
        if (prevDoc.next !== undefined) {
          emit({ type: "walkthrough:chained", walkthrough: prevDoc.id, from: prevDoc.id, to: prevDoc.next });
          // Not playable here: hand it to whichever <Walkthrough> has it --
          // mounted now (it subscribes) or on a later page (it loads).
          if (!(curValid && doc.id === prevDoc.next)) handover = prevDoc.next;
        }
      } else if (why !== "error") {
        emit({ type: "walkthrough:abandoned", walkthrough: prevDoc.id, step: prevStep.id, index: prevIndex });
      }
    }

    if (curValid) {
      const step = doc.steps[index];
      if (!prevValid || !sameDoc) {
        if (why === "resume") {
          emit({ type: "walkthrough:resumed", walkthrough: doc.id, step: step.id, index });
        } else {
          emit({ type: "walkthrough:started", walkthrough: doc.id, step: step.id });
          if (doc.firstValue === undefined || !doc.steps.some((s) => s.id === doc.firstValue)) {
            devWarn(
              doc.firstValue === undefined
                ? `walkthrough "${doc.id}" declares no firstValue step. Completion is not activation; declare the step whose completion IS first value.`
                : `walkthrough "${doc.id}" names firstValue "${doc.firstValue}", which is not one of its steps.`,
            );
            emit({ type: "walkthrough:no-first-value", walkthrough: doc.id });
          }
        }
      } else if (prevIndex !== null && index === prevIndex + 1 && doc.firstValue === doc.steps[prevIndex]?.id && why === "next") {
        // The PERSON moving forward past the first-value step is first value.
        // Moving back over it is not, and neither is a host or agent moving it.
        emit({ type: "walkthrough:first-value", walkthrough: doc.id, step: doc.steps[prevIndex].id });
      }
      emit({ type: "walkthrough:step", walkthrough: doc.id, step: step.id, index });
    }

    // Persist only what THIS walkthrough's transition changed. An idle
    // <Walkthrough> on the page never writes, so it cannot clear the progress
    // of another one sharing the store.
    if (!store || (!prevValid && !curValid)) return;
    if (curValid) void store.save({ walkthrough: doc.id, step: doc.steps[index].id, index });
    else if (handover !== undefined) void store.save({ walkthrough: handover, index: 0 });
    else void store.save(null);
  }, [ready, activeId, index, doc, library, emit, store]);

  // Read the store on mount, and listen for hand-overs from other
  // <Walkthrough>s sharing it. Effects never run on the server, so this is the
  // only place storage is touched.
  const latest = useRef({ running, library, activeId, go, setActiveId });
  latest.current = { running, library, activeId, go, setActiveId };
  useEffect(() => {
    if (!store) return;
    let alive = true;
    const adopt = (progress: WalkthroughProgress | null): void => {
      const { running: busy, library: lib, activeId: active, go: move, setActiveId: activate } = latest.current;
      if (!alive || busy || !progress) return;
      const target = lib.find((d) => d.id === progress.walkthrough);
      if (!target) return;
      const at = resolveIndex(target, progress);
      if (at < 0) return;
      if (target.id !== active) activate(target.id);
      move(at, progress.step === undefined ? "handover" : "resume");
    };
    const read = (then: (progress: WalkthroughProgress | null) => void): void => {
      try {
        const loaded = store.load();
        if (isThenable(loaded)) loaded.then(then, () => then(null));
        else then(loaded);
      } catch {
        then(null);
      }
    };
    read((progress) => {
      adopt(progress);
      if (alive) setReady(true);
    });
    const off = store.subscribe?.(() => read(adopt));
    return () => {
      alive = false;
      off?.();
    };
  }, [store]);

  const signal = useCallback(
    (event: string) => {
      if (current?.advanceOn === "event" && current.event === event) next();
    },
    [current, next],
  );

  const targetEl = useTargetElement(current?.target, registry);
  const missing = running && current.target !== undefined && targetEl === null;
  const policy = current?.whenMissing ?? "wait";

  // Cross-page steps. On entering a step whose `route` is not where the host
  // is, ask the HOST to navigate -- once per step entry, so a person wandering
  // off mid-step is not dragged back. Declared BEFORE the policy effect so the
  // policy, in the same commit, already knows a navigation is under way.
  const navigatingRef = useRef<string | null>(null);
  const [navigatingFor, setNavigatingFor] = useState<string | null>(null);
  const routeInfo = useRef({ current, currentRoute, activeId, index, onNavigate });
  routeInfo.current = { current, currentRoute, activeId, index, onNavigate };
  useEffect(() => {
    navigatingRef.current = null;
    setNavigatingFor(null);
    const { current: step, currentRoute: here, activeId: walkthrough, index: at, onNavigate: navigate } = routeInfo.current;
    if (stepKey === null || !step?.route || walkthrough === undefined || at === null) return;
    const location = here ?? (typeof window !== "undefined" ? window.location.pathname : undefined);
    if (location === step.route) return;
    navigatingRef.current = stepKey;
    setNavigatingFor(stepKey);
    if (navigate) navigate(step, { walkthrough, index: at });
    else devWarn(`step "${step.id}" is on route "${step.route}" but no onNavigate was given; waiting for the person to get there.`);
  }, [stepKey]);

  const arrived = targetEl !== null || (current?.route !== undefined && currentRoute === current.route);
  const navigating = stepKey !== null && navigatingFor === stepKey && !arrived;
  useEffect(() => {
    if (arrived && navigatingRef.current !== null) {
      navigatingRef.current = null;
      setNavigatingFor(null);
    }
  }, [arrived]);

  // A missing target is handled by the step's policy AFTER targets have had
  // their layout effects -- this is a passive effect, so a target mounting in
  // the same commit is already registered by now.
  useEffect(() => {
    if (!missing || index === null || !current) return;
    // Re-read the registry: `missing` was computed during render, before any
    // target mounting in this same commit had registered. Acting on it would
    // skip or fail a step whose target is, by now, right there.
    if (current.target !== undefined && registry.get(current.target)) return;
    // The host is still navigating to this step's page: hold the policy until
    // it arrives (`currentRoute` matches) -- the target cannot be there yet.
    if (navigatingRef.current === stepKey && !(current.route !== undefined && currentRoute === current.route)) return;
    if (policy === "skip") {
      if (index >= stepCount - 1) finish(false);
      else go(index + 1, "auto");
    } else if (policy === "fail") {
      emit({ type: "walkthrough:error", walkthrough: activeId ?? "", step: current.id, reason: `target "${current.target}" is not mounted` });
      go(null, "error");
    }
  }, [missing, policy, index, current, stepCount, go, finish, emit, activeId, registry, stepKey, currentRoute, navigating]);

  // `advanceOn: "target-click"` listens on the real element. Bubble phase, so
  // the app's own handling of the click is not pre-empted.
  useEffect(() => {
    if (!targetEl || current?.advanceOn !== "target-click") return;
    const onClick = () => next();
    targetEl.addEventListener("click", onClick);
    return () => targetEl.removeEventListener("click", onClick);
  }, [targetEl, current, next]);

  useEscapeKey(skip, running);

  const api = useMemo<WalkthroughApi>(
    () => ({ step: running ? index : null, current, walkthrough: activeId ?? null, start, next, back, skip, signal, registry }),
    [running, index, current, activeId, start, next, back, skip, signal, registry],
  );

  return (
    <WalkthroughContext.Provider value={api}>
      <TargetRegistryProvider registry={registry}>{children}</TargetRegistryProvider>
      {running && index !== null && (
        <WalkthroughOverlay
          walkthrough={activeId ?? ""}
          step={current}
          index={index}
          total={stepCount}
          target={missing ? null : targetEl}
          waitingForTarget={missing && (policy === "wait" || navigating)}
          navigatingTo={navigating ? current.route : undefined}
          labels={labels}
          padding={padding}
          radius={radius}
          onScrimClick={dismissOnScrimClick ? skip : undefined}
          animate={animate}
          next={next}
          back={back}
          skip={skip}
          renderStep={renderStep}
          cardClassName={cardClassName}
          bodyFormat={bodyFormat}
        />
      )}
    </WalkthroughContext.Provider>
  );
}

interface OverlayProps {
  walkthrough: string;
  step: WalkthroughStep;
  index: number;
  total: number;
  target: HTMLElement | null;
  waitingForTarget: boolean;
  /** The route the host was asked to navigate to and has not reached yet. */
  navigatingTo?: string;
  labels: WalkthroughLabels;
  padding: number;
  radius: number;
  onScrimClick?: () => void;
  animate: boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
  renderStep?: (context: WalkthroughStepContext) => ReactNode;
  cardClassName?: string;
  bodyFormat: "text" | "markdown";
}

function WalkthroughOverlay({
  walkthrough,
  step,
  index,
  total,
  target,
  waitingForTarget,
  navigatingTo,
  labels,
  padding,
  radius,
  onScrimClick,
  animate,
  next,
  back,
  skip,
  renderStep,
  cardClassName,
  bodyFormat,
}: OverlayProps) {
  const [hole, setHole] = useState<Rect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchored = target !== null && hole !== null;

  // The card anchors to the HOLE, not to the target. They differ exactly when
  // the target is clipped by a scrolling panel, and a card pointing at the
  // clipped-off half of an element points at nothing.
  const position = useFloatingPosition(anchorRef, cardRef, {
    placement: step.placement ?? "bottom",
    offset: 12,
    enabled: anchored,
  });

  // Announce each step: focus the card, which is labelled by its title.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  const context: WalkthroughStepContext = {
    step,
    index,
    total,
    isFirst: index === 0,
    isLast: index === total - 1,
    waitingForTarget,
    labels,
    next,
    back,
    skip,
  };

  const titleId = `fw-${step.id}-title`;

  return (
    <>
      <Spotlight
        target={target}
        padding={padding}
        radius={radius}
        animate={animate}
        onScrimClick={onScrimClick}
        onHoleChange={setHole}
      />
      <Portal>
        {hole && (
          <div
            ref={anchorRef}
            aria-hidden="true"
            data-walkthrough-anchor=""
            style={{ position: "fixed", top: hole.top, left: hole.left, width: hole.width, height: hole.height, pointerEvents: "none" }}
          />
        )}
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={step.title ? titleId : undefined}
          aria-label={step.title ? undefined : `Step ${index + 1} of ${total}`}
          tabIndex={-1}
          data-walkthrough-card={step.id}
          data-walkthrough-id={walkthrough}
          data-walkthrough-navigating={navigatingTo}
          data-walkthrough-placement={anchored ? position.placement : "center"}
          style={
            anchored
              ? { position: "fixed", top: position.y, left: position.x, zIndex: 2147483001, maxWidth: "min(24rem, calc(100vw - 2rem))", outline: "none" }
              : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 2147483001, maxWidth: "min(28rem, calc(100vw - 2rem))", outline: "none" }
          }
        >
          {renderStep ? (
            renderStep(context)
          ) : (
            <DefaultCard context={context} titleId={titleId} className={cardClassName} bodyFormat={bodyFormat} />
          )}
        </div>
      </Portal>
    </>
  );
}

function DefaultCard({
  context,
  titleId,
  className,
  bodyFormat,
}: {
  context: WalkthroughStepContext;
  titleId: string;
  className?: string;
  bodyFormat: "text" | "markdown";
}) {
  const { step, index, total, isFirst, isLast, waitingForTarget, labels, next, back, skip } = context;
  const markdown = (step.bodyFormat ?? bodyFormat) === "markdown";
  const advance = step.advanceOn ?? "next";
  const progress = labels.progress.replace("{current}", String(index + 1)).replace("{total}", String(total));

  return (
    <Card variant="elevated" padding="md" className={["bg-white dark:bg-zinc-900", className].filter(Boolean).join(" ")}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Text as="span" size="xs" color="muted" data-walkthrough-progress="">
            {progress}
          </Text>
          <Button variant="ghost" size="xs" onClick={skip} data-walkthrough-action="skip">
            {labels.skip}
          </Button>
        </div>
        {step.title && (
          <Heading as="h2" size="md" weight="semibold" id={titleId}>
            {step.title}
          </Heading>
        )}
        {step.body &&
          (markdown ? (
            // ContentRenderer sanitises (its `unsafe` stays off): a step body
            // can come from an agent or a stored document.
            <div data-walkthrough-body="markdown">
              <ContentRenderer value={step.body} format="markdown" />
            </div>
          ) : (
            <Text as="p" size="sm" data-walkthrough-body="text">
              {step.body}
            </Text>
          ))}
        {waitingForTarget && (
          <Text as="p" size="xs" color="muted" data-walkthrough-waiting="">
            {labels.waitingForTarget}
          </Text>
        )}
        {!waitingForTarget && advance === "target-click" && (
          <Text as="p" size="xs" color="accent" data-walkthrough-hint="target-click">
            {labels.clickTarget}
          </Text>
        )}
        {!waitingForTarget && advance === "event" && (
          <Text as="p" size="xs" color="accent" data-walkthrough-hint="event">
            {labels.waitingForEvent}
          </Text>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {!isFirst && (
          <Button variant="ghost" size="sm" onClick={back} data-walkthrough-action="back">
            {labels.back}
          </Button>
        )}
        {advance === "next" && (
          <Button size="sm" color="indigo" onClick={next} data-walkthrough-action="next">
            {isLast ? labels.done : labels.next}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** `<Walkthrough>` with `<Walkthrough.Target>` attached. */
export const Walkthrough = Object.assign(WalkthroughRoot, { Target: WalkthroughTarget });
