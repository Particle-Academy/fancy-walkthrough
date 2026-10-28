# AGENTS.md — fancy-walkthrough

Guided walkthroughs for React: self-registering targets, a spotlight over the
target's visible part, JSON steps, activation events. `CLAUDE.md` symlinks here.

This file describes **this package's code**. Process rules — publishing, kit
versioning, the third-party bar — live in the envelope and are not repeated.
The design record is the envelope's `.ai/plans/fancy-walkthrough.md`.

## Layout

- `src/geometry.ts` — pure functions: `visibleRect`, `cutoutPath`, `intersect`,
  `clipsDescendants`, `pad`, `sameRect`. **This file is why the package
  exists**; read its header before changing it.
- `src/registry.tsx` — the target registry (id → element), its context,
  `useTargetElement`, `useWalkthroughTarget`, `WalkthroughTarget`.
- `src/Spotlight.tsx` — the scrim, the hole, live measurement, scroll-into-view,
  the glide.
- `src/Walkthrough.tsx` — step state, events, policies, the default card.
- `src/types.ts` — `WalkthroughStep`, `WalkthroughDocument`, `WalkthroughEvent`.
- `src/controller.ts` — `createWalkthroughController()`: signal / fail actions
  from outside the tree, held while no walkthrough is attached.
- `src/storage.ts` — `WalkthroughStorage` (`{ load, save, subscribe? }`), the
  localStorage default adapter, and the progress shape check.

## Invariants, and the defect each stops

**Measure what is VISIBLE, not the bounding box.** `visibleRect` clips the box
by every clipping ancestor and the viewport. Drawing the raw box is the
incumbent bug: a target in a scrolled panel gets a hole over the panel's border
and the page behind it. `null` (nothing visible) is a state — the spotlight
scrolls the target into view — never a zero-sized hole.

**The registry holds ELEMENTS, not rects.** react-fancy's `useNodeRegistry`
stores rect snapshots; a snapshot is wrong the moment the page scrolls. Measure
from the element every time the geometry can have changed.

**`<Walkthrough>` reads its registry EXPLICITLY.** It provides the registry
context to its children and so cannot consume it: `useTargetElement(id,
registry)`. Reading it from context there returns `null` forever and every step
reads as "waiting for target" — that shipped in the first draft and 7 tests
caught it.

**An explicit registry wins over context, everywhere.** `<Walkthrough registry>`,
`<Walkthrough.Target registry>` and `useWalkthroughTarget(id, { registry })`
exist because context cannot cross React roots (Blade islands beside an
Inertia page). A target that preferred context would register with the wrong
walkthrough the moment one root nests inside another's provider.

**Only the scrim PATH takes pointer events.** The container and the SVG are
`pointer-events: none`; the path is `auto` and drawn `evenodd`, so the hole
excludes it. Clicks in the hole reach the real target, which is what
`advanceOn: "target-click"` depends on.

**Events come from the TRANSITION, not the handlers.** One effect compares the
previous and current index, so a host moving a controlled `step` is reported
like a click. A `reason` ref says why the change happened; **first value
requires `reason === "next"`** — a host or agent moving the step is not the
person doing the thing, and a `whenMissing: "skip"` move (`auto` /
`auto-complete`) is not completion.

**The missing-target policy re-reads the registry.** `missing` is computed
during render, before a target mounting in the same commit has registered in
its layout effect. The policy effect checks `registry.get(target)` again before
skipping or failing. A test mounts the target and moves the step in one update.

**`WalkthroughTarget` re-registers only on change.** Unregister-then-register
every render notifies every subscriber twice per render of whatever holds the
target. And an unregister removes only the element IT registered, so a remount
that registers first is not undone by the old cleanup.

**The transition is (walkthrough, index), not index.** A chain changes both
in one update; the events effect ends the previous walkthrough (completed +
chained) and starts the next from that one comparison.

**Nothing runs until the store is read (`ready`).** Otherwise a resumed
walkthrough first reports `started` at `defaultStep`, then jumps. Storage is
touched ONLY in effects and adapter methods — never at import or render — which
is the whole SSR guarantee; `Walkthrough.ssr.test.tsx` runs in a node env.

**Only a walkthrough's own transition writes the store.** An idle
`<Walkthrough>` on the page never saves, or it would clear another's progress.

**The package never navigates.** `onNavigate` asks the host, once per step
entry (keyed `walkthrough#index`), so a person wandering off is not dragged
back. The navigation effect is declared BEFORE the policy effect and sets
`navigatingRef` synchronously: in the same commit, a `whenMissing: "skip"` step
must already know its page is still on the way.

**The card is non-modal.** A focus trap would block the element a
`target-click` step asks the person to use. Focus moves to the card per step;
Escape skips.

**`signal` / `fail` read the LATEST state through a ref, never their
closure.** Hosts call them from a mutation's `onSuccess` or a page's mount, all
captured at an earlier render. The closure version ignored the awaited signal,
and one captured before Skip revived the dismissed tour. A sabotage test
restores the closure and 5 tests fail.

**Signals before `ready` are HELD, not dropped.** A new page's mount effect runs
before ours reads storage. Held messages are drained once, on the first ready
commit, against the resumed step, and stop after one advance. After `ready`,
nothing is ever held: a signal for a non-current step is ignored, never
remembered, so there is no skipping ahead and nothing after dismissal. The
controller holds only while NO walkthrough is attached, and hands that to the
next one under the same once-only rule.

**An action failure belongs to one VISIT of a step.** It is keyed by step AND
cleared in the transition effect. The key alone would bring the old error back
after leaving the step and returning, which gives the same `walkthrough#index`.

**No Back onto an action-required step.** `canGoBack` is computed in the root,
not the card, so `back()` refuses too and a custom card cannot route around it.

**Glide on target change only.** Scroll and resize snap; a hole trailing a
scrolling page reads as lag. The glide aims at the latest measurement each
frame. Never under `prefers-reduced-motion`.

**Scroll-into-view once per target; a resize re-arms it.** A scroll may be the
person looking elsewhere on purpose; a resize that pushes the target off-screen
is not.

## Traps

- jsdom has no layout. Tests stub `getBoundingClientRect` from a `data-box`
  attribute (`top,left,width,height`); jsdom's `getComputedStyle` does read
  inline `overflow` / `position`, which is what the clipping tests rely on.
- The card's classes (and react-fancy's) only style in a consumer whose Tailwind
  scans both `dist/` folders — see the README. An unstyled card in a scratch
  page means no Tailwind build, not a bug.
- A fresh `npm install` without a lockfile crashes npm 10's arborist
  (`Cannot read properties of null (reading 'edgesOut')`) on the newest vite's
  optional devtools peer set. The lockfile was seeded from react-fancy's to
  resolve the same versions; keep it committed.

## Commands

```bash
npm test          # vitest + jsdom
npm run lint      # tsc --noEmit && eslint
npm run build     # tsup, esm + cjs + dts
```
