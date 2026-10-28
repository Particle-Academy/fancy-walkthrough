# Changelog

Notable changes to `@particle-academy/fancy-walkthrough`, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

---

## [Unreleased]

Additive, so this becomes **0.4.0** (a MINOR). It has one visible behaviour
change (Back, see Changed) and two type additions that can matter to strict
TypeScript. Nothing was removed or renamed.

### Added

- **Action-required steps.** Steps with `advanceOn: "target-click"` or
  `"event"` ask the person to do something in the APP, not in the card. The
  card shows no Next and no Back, only Skip, the instruction and the hint.
  Enter and ArrowRight do not advance them. Use `"event"` with a `target` when
  the click only starts the action (server confirmation, data returning, a
  redirect): the target is spotlighted, and the step moves on when the host
  calls `signal(event)`.
- **`fail(event, message?)`** on `useWalkthrough()`, for when the action failed
  (the server rejected it). The step stays put, the default card shows
  `message` (or the new `labels.actionFailed`) as `role="alert"` with
  `data-walkthrough-error`, and **`walkthrough:action-failed { walkthrough,
  step, event, message? }`** is emitted. The next successful `signal`, or any
  step change, clears it. `useWalkthrough().actionError` exposes it.
- **`createWalkthroughController()`** + **`<Walkthrough controller>`**, for
  signalling from outside the React tree: a query client's mutation defaults, a
  module, another React root. `controller.signal(event)` /
  `controller.fail(event, message?)`. A message sent while no walkthrough is
  mounted (a per-page `<Walkthrough>` mid-visit) is held for the next one, which
  applies it once, only to the step it resumes on and only if that step awaits
  it. Safe to create at module scope and on the server.
- **Handles** on the card wrapper, present with a custom `renderStep` too:
  `data-walkthrough-requires-action="event" | "target-click"`,
  `data-walkthrough-awaiting="<event>"`, and `data-walkthrough-action-error`
  while a failure shows.
- `WalkthroughStepContext` gains `requiresAction`, `canGoBack` and
  `actionError`. New types: `WalkthroughController`, `WalkthroughActionMessage`.

### Changed

- **No Back on an action-required step, and none onto one from the step after
  it.** `back()` refuses that move too. The tour cannot undo what the person
  did in the app (created a project), so going back would ask them to do it
  twice. A host or agent can still move a controlled `step`. **Nothing to do**
  unless your copy told people to press Back on such a step.
- **Strict TypeScript only:** `WalkthroughEvent` has a new member
  (`walkthrough:action-failed`) and `WalkthroughLabels` a new key
  (`actionFailed`). A `switch` that asserts exhaustiveness with `never`, or code
  that builds a complete `WalkthroughLabels` (not the `Partial` the `labels`
  prop takes), needs the new case or key. Everything else compiles unchanged.

### Fixed

- **A `signal` sent from the page an action lands on was lost.** The page's
  mount effect runs before `<Walkthrough>` has read its storage, when no step is
  current yet. Such a signal is now held and applied to the resumed step. A
  page that happened to re-run its effect when `signal` changed identity did
  advance, but reported `walkthrough:started` instead of `resumed` and dropped
  `first-value`.
- **`signal` acted on the render it came from.** A callback captured earlier,
  such as a mutation's `onSuccess`, was ignored if the step had changed since.
  Worse, one captured before the person pressed Skip **brought the dismissed
  tour back** on the following step. `signal` now always reads the latest state.

### Security

- **Dev toolchain only — no runtime change, nothing for consumers to do.** The
  lockfile now resolves `vite` 8.3.5 (was 8.2.2), whose bundled
  `launch-editor` fixes GHSA-587h-7wmj-h5pm (HIGH, `fs.existsSync()` check
  bypassable on Windows), GHSA-698v-4r3x-3vcv (`escapeCmdArgs()` omits `%`
  escaping on Windows) and GHSA-r825-w8mm-5pxw (editor CLI flag
  misinterpretation). `vite` is only reached through the test/dev toolchain
  and the published package does not ship our lockfile, so the exposure was
  this repo's own dev server.

## [0.3.0] - 2026-10-20

**Pre-1.0 reminder:** this is a MINOR release, and in this package a minor may
carry breaking changes. This one carries one behaviour change (see Changed);
no API was removed or renamed.

### Added

- **Chained walkthroughs** (#2). `WalkthroughDocument.next` names the
  walkthrough to start when this one **completes** (skipping never chains).
  Give one `<Walkthrough>` a library with **`walkthroughs={[...docs]}`** and the
  next one starts in place; if `next` is not in the library it is handed over
  through the storage adapter to whichever `<Walkthrough>` has that id, already
  mounted on the page or mounted on a later one.
- **The active walkthrough is controlled state**: `walkthrough` +
  `onWalkthroughChange`, or uncontrolled with `defaultWalkthrough`.
  `useWalkthrough()` gains `walkthrough` (the active id) and
  `start(at?, walkthrough?)`.
- **Steps on another page.** `step.route` + **`<Walkthrough onNavigate>`**: when
  a step starts and the host is elsewhere, `onNavigate(step, { walkthrough,
  index })` is called once and the HOST navigates (Inertia's `router.visit`, its
  own page transition). The package never navigates and depends on no router.
  The card waits for the target to register on the new page, and the step's
  `whenMissing` policy is held off until the host has arrived. Pass
  **`currentRoute`** (compared by string equality) so the package knows where
  the host is; without it, `window.location.pathname` is read in an effect.
- **Resume across navigation and reloads** through a storage adapter, per the
  design record's 2026-09-22 decision: **`storage={{ load, save }}`**, where
  `load()` returns `WalkthroughProgress | null` (or a Promise of it) and
  `save(progress | null)` stores it. `WalkthroughProgress` is
  `{ walkthrough, step?, index }`; resume finds the step by id first, so
  reordering steps does not resume on the wrong one. An optional `subscribe`
  lets a hand-over reach a `<Walkthrough>` already on the page. The default is
  **`createLocalStorageAdapter(key = "fancy-walkthrough")`**, which is SSR-safe
  (nothing touches `window` at import or render) and degrades to remembering
  nothing when storage is disabled or full.
- **Events:** `walkthrough:chained { walkthrough, from, to }` when one hands
  over to the next; `walkthrough:resumed { walkthrough, step, index }` instead
  of `started` when progress is read back (so `started` stays an honest
  denominator); `walkthrough:completed` now carries `next` when there is one.
- **Handles:** the card carries `data-walkthrough-id` (the active walkthrough)
  and, while the host is navigating to its page, `data-walkthrough-navigating`
  (the route).
- Types: `WalkthroughStorage`, `WalkthroughProgress`,
  `WalkthroughNavigateContext`.

### Changed

- **In-progress walkthroughs now persist to localStorage by default.** A tour
  that was running when the page reloaded resumes on the step it was on.
  Finishing or skipping clears it. **To keep 0.2's behaviour, pass
  `storage={null}`.** Nothing else to do: `id` and `steps` are now optional
  (they may come from `walkthroughs` instead), which accepts everything that
  compiled before.
- Nothing runs or reports until the store has been read, so a resumed
  walkthrough does not first report `started` at `defaultStep`. With a sync
  store this happens in the mount effect, before anything is painted.

## [0.2.0] - 2026-10-19

### Added

- **Targets in another React root** (#1). A Laravel layout mounts its chrome as
  separate roots (Blade islands) beside the Inertia page, and context cannot
  cross roots, so a target there never registered and its step waited forever.
  Create one registry with **`createWalkthroughRegistry()`**, pass it to
  **`<Walkthrough registry>`**, and register targets with it from any root:
  **`<Walkthrough.Target registry>`**, **`useWalkthroughTarget(id, { registry })`**
  (or `useWalkthroughTarget(id, registry)`), or
  **`<WalkthroughTargetsProvider registry>`** around a whole root with no
  `<Walkthrough>` above it. An explicit registry wins over context. Nothing
  queries the DOM.
- **Markdown step bodies.** `bodyFormat: "markdown"` on a step, or
  `<Walkthrough bodyFormat="markdown">` for every step, renders `body` through
  react-fancy's `ContentRenderer`, sanitised. A step's own `bodyFormat` wins.
- The body element carries `data-walkthrough-body` (`"text"` or `"markdown"`).
- Types: `WalkthroughTargetOptions`, `WalkthroughTargetsProviderProps`.

**Nothing to do:** plain string bodies stay plain text by default, and a
walkthrough with no `registry` keeps its own, exactly as before. The
react-fancy peer range is unchanged.

### Fixed

- **`CHANGELOG.md` is now in the published tarball.** `files` did not whitelist it, so npm never shipped it — and this package puts breaking changes in MINOR releases and tells you in the README to read the entry before taking one. The instruction existed for the author, who has the file, and not for the consumer, who is the only one being instructed. Nothing for you to do; the file simply arrives from this release on.

### Security

- `source-map-js` is pinned forward to `^1.2.2` via `overrides`. Versions up to
  1.2.1 allow an event-loop denial of service through indexed source-map section
  offsets, and it arrives here transitively through the build toolchain.
  **Nothing for a consumer to do, and no runtime change**: an npm package does
  not ship a lockfile, so this governs builds OF this repo, not anything
  installed FROM it. Recorded rather than left silent because the override it
  sits beside — `shell-quote` `^1.9.0`, added for an earlier advisory — was
  carried with no note of why, and had drifted back inside the vulnerable range
  before anyone looked.

## [0.1.3] - 2026-09-29

### Fixed

- **Corrects the claim made in 0.1.2.** That entry said it fixed "the spotlight
  did not move between targets". **It did not, because there was no such
  product defect** — the symptom was an artefact of how I verified it.

  What actually happened: the browser tab driving the check was a BACKGROUND
  tab (`document.hidden === true`). Chrome throttles `requestAnimationFrame` to
  zero there, so the glide's callback never ran — measured, not guessed: one
  rAF scheduled, zero fired in 900ms. The hole therefore stayed on the first
  target. `animate={false}` appeared to "fix" it only because that path draws
  synchronously inside the layout effect and needs no rAF at all. A real user,
  in a visible tab, would not have seen any of it.

  The defect 0.1.2 genuinely fixed is real and unrelated to that symptom, and
  stands: the glide measured elapsed time across **two clocks** (`start` from
  `performance.now()`, `now` from the rAF timestamp) and clamped with
  `Math.min(1, …)`, which caps only the top. A first callback stamped before the
  call drives `t` negative and `lerp` extrapolates away from the target.
  Reproduced and covered by `src/Spotlight.glide.test.tsx`.

  No code changed in this release. The correction is the point: 0.1.2's entry is
  the version an upgrading consumer reads, and it described a fix to a bug that
  did not exist — which would send anyone debugging a stationary spotlight down
  the wrong path. What to check first is whether the tab is visible.

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
