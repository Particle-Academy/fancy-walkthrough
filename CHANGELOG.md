# Changelog

Notable changes to `@particle-academy/fancy-walkthrough`, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

---

## [Unreleased]

## [0.1.2] - 2026-09-29

### Fixed

- **The spotlight did not move between targets.** Every step after the first
  kept the hole on the first step's target, so a tour with more than one target
  was broken — which is most tours. Found by building the showcase's own site
  tour on it.

  The glide measured elapsed time across two clocks: `start` came from
  `performance.now()` while `now` was the `requestAnimationFrame` timestamp. A
  first callback carrying a timestamp from before the call makes the difference
  negative, and the clamp was `Math.min(1, …)` — which caps only the top. So `t`
  either went negative, and `lerp` extrapolated AWAY from the target (the hole
  landing hundreds of pixels off-screen), or pinned at `0` and the glide never
  advanced. Both read as "the spotlight never moved".

  The clock now starts on the first rAF callback, so elapsed time is measured in
  one timebase, and `t` is clamped at both ends.

  **Why 0.1.0 and 0.1.1 looked fine:** the broken transition is element →
  element. `null` → element skips the glide entirely (there is nothing to glide
  *from*), so the first targeted step always drew correctly — and the package's
  own demo only moved between targets that required a SCROLL, which fires a
  re-measure and papered over it. `animate={false}` was unaffected throughout.

  **What you must do: nothing**, beyond upgrading. No API changed.

## [0.1.1] - 2026-09-29

### Fixed

- **The published tarball now ships `docs/`.** 0.1.0 had no `docs/` directory
  and its `files` array omitted it, so the package went to npm with a README and
  nothing else. The workspace publishing protocol lists `files: ["dist", "docs",
  "README.md"]` as a hard requirement for a TS package precisely so the tarball
  carries its own reference — an agent resolving the package offline has only
  what shipped.

  Adds `docs/Walkthrough.md`, `docs/Spotlight.md` and
  `docs/WalkthroughTarget.md`: full prop tables, the `advanceOn` and
  `whenMissing` semantics, the event list, and why `firstValue` rather than
  completion is the number to watch.

  No code changed.

## [0.1.0] - 2026-09-29

### Added

- **`<Walkthrough>`** — JSON steps, a controlled step index (`step` +
  `onStepChange`, or uncontrolled with `defaultStep`), and `useWalkthrough()`
  (`start` / `next` / `back` / `skip` / `signal`).
- **Self-registering targets** — `<Walkthrough.Target id>` (a
  `display: contents` wrapper that registers its first element child, so it adds
  no box to your layout) and `useWalkthroughTarget(id)` for components that
  render their own element. Nothing queries the DOM by selector.
- **`<Spotlight>`** — a scrim with a hole over the target's VISIBLE part: its
  box clipped by every clipping ancestor and the viewport, re-measured on scroll
  in any container, on resize, and on target resize. A target that is not
  visible is scrolled into view once (and again after a resize, which is not the
  person looking away). Clicks pass through the hole to the real target. Glides
  between targets; never under `prefers-reduced-motion`. Themed with
  `--fw-scrim`, `--fw-ring` and `--fw-ring-glow`.
- **Guided action** — `advanceOn: "target-click"` advances when the person
  clicks the real target; `advanceOn: "event"` advances on
  `signal(event)` from your app.
- **Missing-target policies** — `whenMissing: "wait"` (default; shows the step
  centred and says it is waiting), `"skip"`, `"fail"`.
- **Activation events** — `started`, `step`, `first-value`, `abandoned`,
  `completed`, `no-first-value`, `error`. First value counts only when the
  person moves forward past the declared `firstValue` step; a host or agent
  moving the step, or a policy skip, never produces it. A document with no
  valid `firstValue` runs, warns in development, and emits `no-first-value`.
- **Geometry helpers** — `visibleRect`, `cutoutPath`, `intersect`,
  `clipsDescendants`, `pad`.
