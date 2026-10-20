# WalkthroughTarget

Marks an element a step can point at. Targets register **themselves**, by id —
nothing queries the DOM by selector, so a step cannot silently point at
whatever a refactor left behind.

## Import

```tsx
import {
  WalkthroughTarget,
  useWalkthroughTarget,
  useTargetElement,
  createTargetRegistry,
} from "@particle-academy/fancy-walkthrough";
```

## Basic Usage

```tsx
<WalkthroughTarget id="new-project">
  <Button onClick={create}>New project</Button>
</WalkthroughTarget>
```

`WalkthroughTarget` is a `display: contents` wrapper: it registers its first
element child and **adds no box to your layout**, so dropping one around an
existing element cannot move anything.

## Props

| Prop | Type | Description |
|------|------|-------------|
| id | `string` | The id a step's `target` refers to. |
| children | `ReactNode` | Wrapped content; the first element child is registered. |
| registry | `TargetRegistry` | Register here instead of with the walkthrough above — for a target in another React root. |

## For a component that renders its own element

```tsx
function Toolbar() {
  const ref = useWalkthroughTarget("toolbar");
  return <div ref={ref}>…</div>;
}
```

`useWalkthroughTarget(id)` returns a ref callback — attach it and the element
registers and unregisters with the component.

## Reading a target

`useTargetElement(id)` returns the registered element, or `undefined`. Useful
for driving a `<Spotlight>` yourself.

## `TargetRegistry`

| Member | Type | Description |
|------|------|-------------|
| register | `(id, el) => () => void` | Register; returns the unregister function. |
| get | `(id) => HTMLElement \| undefined` | Look one up. |
| ids | `() => string[]` | Every registered id, in registration order. |
| subscribe | `(listener) => () => void` | Notified when the set changes. |

`createTargetRegistry()` makes a standalone one. `<Walkthrough>` creates its
own and exposes it as `useWalkthrough().registry`.

## Targets in another React root

Context does not cross React roots. A Laravel layout that mounts its chrome as
separate roots (Blade islands) beside the Inertia page has targets no
`<Walkthrough>` can reach through context. Create one registry in a module and
hand it to every root:

```tsx
// tour-registry.ts
import { createWalkthroughRegistry } from "@particle-academy/fancy-walkthrough";
export const tourTargets = createWalkthroughRegistry();

// The Inertia root: the one walkthrough.
<Walkthrough id="layout" steps={steps} firstValue="menu" registry={tourTargets}>…</Walkthrough>

// Any island, one target at a time…
<Walkthrough.Target id="user-menu" registry={tourTargets}><UserMenu /></Walkthrough.Target>
const ref = useWalkthroughTarget("sidebar", { registry: tourTargets }); // or (id, tourTargets)

// …or the whole island at once, with no <Walkthrough> above it.
<WalkthroughTargetsProvider registry={tourTargets}><SidebarNav /></WalkthroughTargetsProvider>
```

An explicit `registry` wins over context. Targets still register themselves:
nothing queries the DOM, and a target unmounting in its own root unregisters.

## A missing target is a state, not a crash

Because registration is explicit, "this target is not here" is knowable. A step
handles it with `whenMissing`: `"wait"` (the default) shows the step centred
until it mounts, `"skip"` moves on, `"fail"` stops and emits
`walkthrough:error`. Nothing points at a stale selector.

## See also

- [Walkthrough](./Walkthrough.md)
- [Spotlight](./Spotlight.md)
