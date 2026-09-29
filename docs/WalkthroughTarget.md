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

## A missing target is a state, not a crash

Because registration is explicit, "this target is not here" is knowable. A step
handles it with `whenMissing`: `"wait"` (the default) shows the step centred
until it mounts, `"skip"` moves on, `"fail"` stops and emits
`walkthrough:error`. Nothing points at a stale selector.

## See also

- [Walkthrough](./Walkthrough.md)
- [Spotlight](./Spotlight.md)
