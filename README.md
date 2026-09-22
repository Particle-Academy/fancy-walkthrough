# @particle-academy/fancy-walkthrough

[![Fancified](art/fancified.svg)](https://particle.academy)

**Guided walkthroughs for React apps — the first-party replacement for
intro.js-style tours.**

Tour libraries find their targets with selectors, measure a box once, and draw a
hole there. That breaks the moment a target sits in a scrolling panel, mounts a
beat late, or the page moves. This package does it the other way round:

- **Targets register themselves** by id. Nothing runs `querySelector`, so
  nothing silently matches nothing.
- **The spotlight measures what is visible**, live — the target's box clipped by
  every scrolling ancestor, re-measured on scroll in any container, on resize,
  and when the target changes size. A target inside a scrolled panel is never
  spotlighted past the panel's edge.
- **The person does the thing.** A step can advance when they click the real
  target through the hole, or when your app signals an event — guided action,
  not a slideshow.
- **Steps are JSON**, so an agent can write them and you can store and diff them.
- **Activation is measured by default.** Every walkthrough declares its
  *first-value* step, and completing it is the event that matters —
  `walkthrough:completed` is deliberately not the success metric.

## Install

```bash
npm install @particle-academy/fancy-walkthrough @particle-academy/react-fancy
```

Peers: `react` 19, `react-dom` 19, `@particle-academy/react-fancy` 5, and
Tailwind v4. Add both packages to your Tailwind sources, next to react-fancy's:

```css
@source "../node_modules/@particle-academy/react-fancy/dist/**/*.js";
@source "../node_modules/@particle-academy/fancy-walkthrough/dist/**/*.js";
```

## Use it

```tsx
import { Walkthrough, useWalkthrough, type WalkthroughDocument } from "@particle-academy/fancy-walkthrough";

const onboarding: WalkthroughDocument = {
  id: "onboarding",
  firstValue: "create",
  steps: [
    { id: "welcome", title: "Welcome", body: "Two minutes to your first project." },
    { id: "create", title: "Create a project", target: "new-project", advanceOn: "target-click" },
    { id: "done", title: "You're set" },
  ],
};

export function App() {
  return (
    <Walkthrough {...onboarding} onEvent={track}>
      <Walkthrough.Target id="new-project">
        <Button onClick={createProject}>New project</Button>
      </Walkthrough.Target>
      <StartTour />
    </Walkthrough>
  );
}

function StartTour() {
  const { start } = useWalkthrough();
  return <Button onClick={() => start()}>Take the tour</Button>;
}
```

`<Walkthrough.Target>` adds no box to your layout: it renders a
`display: contents` wrapper and registers its first element child. For a
component that renders its own DOM, register the element directly:

```tsx
const ref = useWalkthroughTarget("new-project");
return <button ref={ref}>New project</button>;
```

## Steps

```ts
type WalkthroughStep = {
  id: string;
  target?: string;          // a registered target id; omitted = centred step
  title?: string;
  body?: string;
  placement?: "top" | "top-start" | "top-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "right";
  advanceOn?: "next" | "target-click" | "event";   // default "next"
  event?: string;           // for advanceOn: "event" -- see signal() below
  whenMissing?: "wait" | "skip" | "fail";          // default "wait"
};
```

- **`advanceOn: "target-click"`** waits for the person to click the real target
  through the spotlight. Your app's own click handler still runs.
- **`advanceOn: "event"`** waits for your app: call
  `useWalkthrough().signal("project:saved")` when the thing has happened.
- **`whenMissing`** decides what a step does when its target is not mounted.
  `"wait"` (default) shows the step centred and says it is waiting — it never
  skips silently. `"skip"` moves on; `"fail"` stops and emits
  `walkthrough:error`.

## Controlled

The step index is controlled, so a router, your own state, or an agent can read
and move it:

```tsx
const [step, setStep] = useState<number | null>(null); // null = not running
<Walkthrough {...onboarding} step={step} onStepChange={setStep}>…</Walkthrough>
```

Or leave it uncontrolled with `defaultStep`, and drive it with
`useWalkthrough()` — `start`, `next`, `back`, `skip`, `signal`.

## Events

`onEvent` receives:

| Event | Meaning |
|---|---|
| `walkthrough:started` | The denominator. |
| `walkthrough:step` | Diagnostic — which step is showing. Never the headline. |
| `walkthrough:first-value` | The person completed the `firstValue` step. **This is the metric.** |
| `walkthrough:abandoned` | Skipped, Escape, or ended by the host — with the step it happened on. |
| `walkthrough:completed` | Reached the end. Explicitly not the success metric. |
| `walkthrough:no-first-value` | The document declares no (valid) `firstValue`. It still runs, and warns in development. |
| `walkthrough:error` | A `whenMissing: "fail"` step's target was not mounted. |

First value counts only when **the person** moves forward past that step. A
host or agent moving `step` itself, or a step skipped by `whenMissing: "skip"`,
never produces it.

## Make it yours

- **Theme the spotlight** with CSS variables: `--fw-scrim` (the dimmed area),
  `--fw-ring` (the hole's outline) and `--fw-ring-glow`.
- **Reword it** with `labels` — every string the default card uses.
- **Replace the card** with `renderStep={(ctx) => …}`. You get the step, its
  index, `next` / `back` / `skip`, and whether it is waiting for its target; the
  spotlight and positioning stay yours for free.
- **`padding`**, **`radius`**, **`animate`** (the spotlight glides between
  targets, and never under `prefers-reduced-motion`), and
  **`dismissOnScrimClick`** (off by default — a stray click should not end it).

The card is a **non-modal** dialog on purpose: a focus trap would stop the
person reaching the element a `target-click` step asks them to use. Focus moves
to the card on each step so it is announced, and Escape ends the walkthrough.

## The pieces, on their own

`<Spotlight target={el} />` is exported by itself, and so are the geometry
helpers behind it — `visibleRect(el, viewport)` (the part of an element a
person can see) and `cutoutPath(viewport, hole)` (the scrim as one SVG path).

## Status

**0.1** — the walkthrough, targets, the spotlight, guided action, missing-target
policies and the event stream. Next: resume across reloads through a storage
adapter (0.2), an authoring surface on an `/authoring` subpath (0.3), and an MCP
bridge in `@particle-academy/agent-integrations` (0.4).

## License

MIT
