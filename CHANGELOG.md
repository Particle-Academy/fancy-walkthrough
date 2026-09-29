# Changelog

Notable changes to `@particle-academy/fancy-walkthrough`, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

---

## [Unreleased]

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
