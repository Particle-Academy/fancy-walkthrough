# Spotlight

A scrim with a hole over the **visible part** of a target. Usable on its own —
`<Walkthrough>` renders one internally, but nothing stops you using it for a
"press here" affordance of your own.

## Import

```tsx
import { Spotlight } from "@particle-academy/fancy-walkthrough";
```

## Basic Usage

```tsx
<Spotlight target={el} onScrimClick={() => setOpen(false)} />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| target | `HTMLElement \| null` | — | The element to spotlight. `null` = a solid scrim. |
| padding | `number` | `6` | Space between the target and the edge of the hole. |
| radius | `number` | `10` | Corner radius of the hole. |
| onScrimClick | `() => void` | — | Clicking the dimmed area. The hole passes clicks through. |
| onHoleChange | `(hole: Rect \| null) => void` | — | Reports the hole as drawn — what a card anchors to. |
| animate | `boolean` | `true` | Glide between targets. Off under `prefers-reduced-motion` regardless. |
| className | `string` | — | On the scrim. |
| style | `CSSProperties` | — | On the scrim. |

## The visible part, not the bounding box

This is the whole reason the component exists. A target's box is clipped by
every scrolling or `overflow: hidden` ancestor and by the viewport, and the
spotlight re-measures on scroll **in any container**, on resize, and when the
target itself resizes.

The consequences, all of which are the failure modes that make tour libraries
feel broken:

- A target scrolled halfway out of a panel gets a hole over the **visible 20px**,
  not a hole floating over the panel's edge.
- A target scrolled entirely out of view gets **no hole at all**, rather than a
  bright rectangle stranded at stale coordinates.
- A target not currently visible is scrolled into view **once** — and again after
  a resize, which is a layout change rather than the person looking away.

`onHoleChange` reports the hole after clipping, so anything you anchor to it
follows the same geometry.

## Clicks pass through

The hole is a hole. A click inside it reaches the real element and runs your
real handler; `onScrimClick` only fires outside it. That is what lets a step
say "click the thing" and have clicking the thing both advance the tour and do
what it normally does.

## See also

- [Walkthrough](./Walkthrough.md) — the full tour
- [WalkthroughTarget](./WalkthroughTarget.md) — registering what to point at
