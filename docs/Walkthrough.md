# Walkthrough

A guided product tour over your real interface. Steps are plain JSON, targets
register themselves, and a step can wait for the person to actually *do* the
thing rather than press Next.

## Import

```tsx
import { Walkthrough, useWalkthrough } from "@particle-academy/fancy-walkthrough";
```

## Basic Usage

```tsx
<Walkthrough
  id="onboarding"
  firstValue="create"
  steps={[
    { id: "welcome", title: "Welcome", body: "Two minutes to your first project." },
    { id: "create", target: "new-project", title: "Create one", advanceOn: "target-click" },
  ]}
>
  <App />
</Walkthrough>
```

Nothing runs until you start it:

```tsx
const { start } = useWalkthrough();
<Button onClick={() => start()}>Start tour</Button>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| id | `string` | — | Identifies this walkthrough in every event. |
| steps | `WalkthroughStep[]` | — | The steps. Plain JSON — an agent can write them. |
| firstValue | `string` | — | The step whose completion IS activation. See below. |
| step | `number \| null` | — | Controlled step index. `null` = not running. |
| defaultStep | `number \| null` | `null` | Uncontrolled starting step. |
| onStepChange | `(step: number \| null) => void` | — | Fires on every step change. |
| onEvent | `(event: WalkthroughEvent) => void` | — | Every event (see below). |
| renderStep | `(ctx: WalkthroughStepContext) => ReactNode` | — | Replace the card entirely; spotlight and positioning stay. |
| labels | `Partial<WalkthroughLabels>` | — | Override any button or status string. |
| padding | `number` | `6` | Space around the target inside the hole. |
| radius | `number` | `10` | Hole corner radius. |
| dismissOnScrimClick | `boolean` | `false` | A stray click should not end a tour. |
| animate | `boolean` | `true` | Glide between targets. Always off under `prefers-reduced-motion`. |

## `WalkthroughStep`

| Field | Type | Default | Description |
|------|------|---------|-------------|
| id | `string` | — | Step id. |
| target | `string` | — | A registered target id. Omitted = a centred step over a solid scrim. |
| title | `string` | — | Heading. |
| body | `string` | — | Body copy. |
| placement | `Placement` | auto | `top` / `bottom` / `left` / `right` (+ `-start` / `-end`). |
| advanceOn | `"next" \| "target-click" \| "event"` | `"next"` | What moves it on. |
| event | `string` | — | The host event, when `advanceOn` is `"event"`. |
| whenMissing | `"wait" \| "skip" \| "fail"` | `"wait"` | What to do if `target` is not mounted. |

`advanceOn` is the difference between a tour and a slideshow. `"target-click"`
waits for a real click on the real element **through** the spotlight — the click
reaches your handler as well. `"event"` waits for your app to call
`signal(event)`, which is how you gate on something asynchronous like a saved
record.

`whenMissing` defaults to `"wait"` on purpose: a target that has not mounted yet
shows the step centred until it appears, rather than silently skipping a step
the person was supposed to see.

## Measure first value, not completion

`firstValue` names the step that represents the activation this walkthrough
exists to cause. Completing it emits `walkthrough:first-value`, and that is the
number to watch — `walkthrough:completed` mostly measures politeness.

Omitting `firstValue` runs fine, warns in development, and emits
`walkthrough:no-first-value` so the gap is visible rather than assumed.

## `useWalkthrough()`

| Member | Type | Description |
|------|------|-------------|
| step | `number \| null` | Running step index, or `null`. |
| current | `WalkthroughStep \| null` | The running step. |
| start | `(at?: number) => void` | Start, optionally at an index. |
| next / back | `() => void` | Move. |
| skip | `() => void` | End early. Reported as `abandoned`. |
| signal | `(event: string) => void` | Tell it something happened in your app. |
| registry | `TargetRegistry` | The target registry, for advanced cases. |

## Events

```ts
type WalkthroughEvent =
  | { type: "walkthrough:started";         walkthrough: string; step: string }
  | { type: "walkthrough:step";            walkthrough: string; step: string; index: number }
  | { type: "walkthrough:first-value";     walkthrough: string; step: string }
  | { type: "walkthrough:abandoned";       walkthrough: string; step: string; index: number }
  | { type: "walkthrough:completed";       walkthrough: string }
  | { type: "walkthrough:no-first-value";  walkthrough: string }
  | { type: "walkthrough:error";           walkthrough: string; step: string; reason: string };
```

`abandoned` carries the step and index it was abandoned ON, which is the one
number that tells you where a tour loses people.

## See also

- [WalkthroughTarget](./WalkthroughTarget.md) — marking the things a step points at
- [Spotlight](./Spotlight.md) — the scrim and hole, usable on its own
