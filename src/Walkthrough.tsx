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
import type { WalkthroughEvent, WalkthroughStep } from "./types";

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

export interface WalkthroughProps {
  /** Identifies this walkthrough in every event. */
  id: string;
  steps: WalkthroughStep[];
  /** The step whose completion is first value. See `WalkthroughDocument`. */
  firstValue?: string;
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
  /** The app. Targets anywhere inside register with this walkthrough. */
  children?: ReactNode;
}

export interface WalkthroughApi {
  /** The running step index, or `null`. */
  step: number | null;
  current: WalkthroughStep | null;
  start: (at?: number) => void;
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

// `auto` / `auto-complete`: moved on by the `whenMissing: "skip"` policy. A
// step skipped because its target never mounted was not completed, so neither
// counts toward first value.
type Reason = "next" | "back" | "skip" | "complete" | "auto" | "auto-complete" | "error" | "start";

function devWarn(message: string): void {
  // Read through globalThis: a browser has no `process`, and a bundler that
  // replaces `process.env.NODE_ENV` still sees the same expression.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (env !== "production" && typeof console !== "undefined") console.warn(`[fancy-walkthrough] ${message}`);
}

/**
 * A guided walkthrough over your app.
 *
 * Steps are JSON; targets register themselves with `<Walkthrough.Target>` or
 * `useWalkthroughTarget`; the step index is controlled (`step` +
 * `onStepChange`) so a host, a router or an agent can read and move it.
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
  children,
}: WalkthroughProps) {
  const [registry] = useState(createTargetRegistry);
  const [index, setIndex] = useControllableState<number | null>(controlledStep, defaultStep, onStepChange);

  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const current = index !== null && index >= 0 && index < steps.length ? steps[index] : null;
  const running = current !== null;

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

  const start = useCallback(
    (at = 0) => {
      if (index !== at) go(at, "start");
    },
    [go, index],
  );
  const next = useCallback(() => {
    if (index === null) return;
    if (index >= steps.length - 1) go(null, "complete");
    else go(index + 1, "next");
  }, [go, index, steps.length]);
  const back = useCallback(() => {
    if (index !== null && index > 0) go(index - 1, "back");
  }, [go, index]);
  const skip = useCallback(() => {
    if (index !== null) go(null, "skip");
  }, [go, index]);

  // Events are derived from the TRANSITION, not emitted by the handlers, so a
  // host moving `step` itself is reported exactly like a click would be.
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = index;
    const why = reason.current;
    reason.current = null;
    if (prev === index) return;

    const valid = (i: number | null): i is number => i !== null && i >= 0 && i < steps.length;
    const completedFirstValue = (i: number) => firstValue !== undefined && steps[i]?.id === firstValue;

    if (!valid(prev) && valid(index)) {
      emit({ type: "walkthrough:started", walkthrough: id, step: steps[index].id });
      if (firstValue === undefined || !steps.some((s) => s.id === firstValue)) {
        devWarn(
          firstValue === undefined
            ? `walkthrough "${id}" declares no firstValue step. Completion is not activation; declare the step whose completion IS first value.`
            : `walkthrough "${id}" names firstValue "${firstValue}", which is not one of its steps.`,
        );
        emit({ type: "walkthrough:no-first-value", walkthrough: id });
      }
      emit({ type: "walkthrough:step", walkthrough: id, step: steps[index].id, index });
      return;
    }

    if (valid(prev) && valid(index)) {
      // The PERSON moving forward past the first-value step is first value.
      // Moving back over it is not, and neither is a host or agent moving it.
      if (index === prev + 1 && completedFirstValue(prev) && why === "next") {
        emit({ type: "walkthrough:first-value", walkthrough: id, step: steps[prev].id });
      }
      emit({ type: "walkthrough:step", walkthrough: id, step: steps[index].id, index });
      return;
    }

    if (valid(prev) && !valid(index)) {
      if (why === "complete" || why === "auto-complete") {
        if (why === "complete" && completedFirstValue(prev)) {
          emit({ type: "walkthrough:first-value", walkthrough: id, step: steps[prev].id });
        }
        emit({ type: "walkthrough:completed", walkthrough: id });
      } else if (why !== "error") {
        emit({ type: "walkthrough:abandoned", walkthrough: id, step: steps[prev].id, index: prev });
      }
    }
  }, [index, steps, firstValue, id, emit]);

  const signal = useCallback(
    (event: string) => {
      if (current?.advanceOn === "event" && current.event === event) next();
    },
    [current, next],
  );

  const targetEl = useTargetElement(current?.target, registry);
  const missing = running && current.target !== undefined && targetEl === null;
  const policy = current?.whenMissing ?? "wait";

  // A missing target is handled by the step's policy AFTER targets have had
  // their layout effects -- this is a passive effect, so a target mounting in
  // the same commit is already registered by now.
  useEffect(() => {
    if (!missing || index === null || !current) return;
    // Re-read the registry: `missing` was computed during render, before any
    // target mounting in this same commit had registered. Acting on it would
    // skip or fail a step whose target is, by now, right there.
    if (current.target !== undefined && registry.get(current.target)) return;
    if (policy === "skip") {
      if (index >= steps.length - 1) go(null, "auto-complete");
      else go(index + 1, "auto");
    } else if (policy === "fail") {
      emit({ type: "walkthrough:error", walkthrough: id, step: current.id, reason: `target "${current.target}" is not mounted` });
      go(null, "error");
    }
  }, [missing, policy, index, current, steps.length, go, emit, id, registry]);

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
    () => ({ step: running ? index : null, current, start, next, back, skip, signal, registry }),
    [running, index, current, start, next, back, skip, signal, registry],
  );

  return (
    <WalkthroughContext.Provider value={api}>
      <TargetRegistryProvider registry={registry}>{children}</TargetRegistryProvider>
      {running && index !== null && (
        <WalkthroughOverlay
          step={current}
          index={index}
          total={steps.length}
          target={missing ? null : targetEl}
          waitingForTarget={missing && policy === "wait"}
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
        />
      )}
    </WalkthroughContext.Provider>
  );
}

interface OverlayProps {
  step: WalkthroughStep;
  index: number;
  total: number;
  target: HTMLElement | null;
  waitingForTarget: boolean;
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
}

function WalkthroughOverlay({
  step,
  index,
  total,
  target,
  waitingForTarget,
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
          data-walkthrough-placement={anchored ? position.placement : "center"}
          style={
            anchored
              ? { position: "fixed", top: position.y, left: position.x, zIndex: 2147483001, maxWidth: "min(24rem, calc(100vw - 2rem))", outline: "none" }
              : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 2147483001, maxWidth: "min(28rem, calc(100vw - 2rem))", outline: "none" }
          }
        >
          {renderStep ? renderStep(context) : <DefaultCard context={context} titleId={titleId} className={cardClassName} />}
        </div>
      </Portal>
    </>
  );
}

function DefaultCard({ context, titleId, className }: { context: WalkthroughStepContext; titleId: string; className?: string }) {
  const { step, index, total, isFirst, isLast, waitingForTarget, labels, next, back, skip } = context;
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
        {step.body && (
          <Text as="p" size="sm">
            {step.body}
          </Text>
        )}
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
