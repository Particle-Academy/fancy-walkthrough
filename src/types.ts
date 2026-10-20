/**
 * Where the step card sits relative to its target. The same set react-fancy's
 * `useFloatingPosition` places, because that is what places it.
 */
export type Placement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "right";

/**
 * One step. Plain JSON: an agent can write it, a host can store and diff it,
 * and the same document drives the human's walkthrough and the MCP bridge.
 */
export interface WalkthroughStep {
  id: string;
  /** A registered target id. Omitted = a centred step with a solid scrim. */
  target?: string;
  title?: string;
  body?: string;
  /**
   * How `body` is read. `"text"` (default) shows it as written;
   * `"markdown"` renders it through react-fancy's `ContentRenderer`,
   * sanitised. Overrides the walkthrough's `bodyFormat`.
   */
  bodyFormat?: "text" | "markdown";
  placement?: Placement;
  /**
   * What moves the walkthrough on. `"next"` (default) is the button;
   * `"target-click"` waits for the person to click the real target through the
   * spotlight; `"event"` waits for the host to signal `event`. The last two are
   * what make this guided ACTION rather than a slideshow.
   */
  advanceOn?: "next" | "target-click" | "event";
  /** The host event that advances this step when `advanceOn` is `"event"`. */
  event?: string;
  /**
   * What to do when `target` is not mounted. Default `"wait"`: show the step
   * centred until it mounts -- never skip silently. `"skip"` moves on;
   * `"fail"` stops the walkthrough and emits `walkthrough:error`.
   */
  whenMissing?: "wait" | "skip" | "fail";
  /**
   * The route this step's target lives on. When the step starts and the host
   * is somewhere else, `<Walkthrough onNavigate>` is called so the HOST
   * navigates (its router, its page transition) -- the package never does.
   * The card waits for the target to register on the new page, and the
   * missing-target policy is held off until the host has arrived.
   */
  route?: string;
}

/** A whole walkthrough as data. Spread it: `<Walkthrough {...doc}>`. */
export interface WalkthroughDocument {
  id: string;
  steps: WalkthroughStep[];
  /**
   * The step whose completion IS first value -- the activation this
   * walkthrough exists to produce. Completing it emits
   * `walkthrough:first-value`, which is the metric to watch; `completed` is
   * not. Omitting it runs, warns in development, and emits
   * `walkthrough:no-first-value`.
   */
  firstValue?: string;
  /**
   * The id of the walkthrough to start when this one COMPLETES (not when it
   * is skipped). Resolved against `<Walkthrough walkthroughs>`; if it is not
   * there, it is handed over through the storage adapter to whichever
   * `<Walkthrough>` has that id, now or on a later page.
   */
  next?: string;
}

/**
 * Everything the walkthrough reports. Step completion is deliberately NOT the
 * headline: `first-value` is.
 */
export type WalkthroughEvent =
  | { type: "walkthrough:started"; walkthrough: string; step: string }
  | { type: "walkthrough:step"; walkthrough: string; step: string; index: number }
  | { type: "walkthrough:first-value"; walkthrough: string; step: string }
  | { type: "walkthrough:abandoned"; walkthrough: string; step: string; index: number }
  | { type: "walkthrough:resumed"; walkthrough: string; step: string; index: number }
  | { type: "walkthrough:completed"; walkthrough: string; next?: string }
  | { type: "walkthrough:chained"; walkthrough: string; from: string; to: string }
  | { type: "walkthrough:no-first-value"; walkthrough: string }
  | { type: "walkthrough:error"; walkthrough: string; step: string; reason: string };
