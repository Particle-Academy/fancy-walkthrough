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
| registry | `TargetRegistry` | its own | A registry from `createWalkthroughRegistry()`, shared with targets in OTHER React roots. See [WalkthroughTarget](./WalkthroughTarget.md#targets-in-another-react-root). |
| bodyFormat | `"text" \| "markdown"` | `"text"` | How every step's `body` is read, unless the step sets its own. |
| next | `string` | — | The walkthrough to start when this one completes. Comes with a spread document. |
| walkthroughs | `WalkthroughDocument[]` | — | A library to chain into — or, with no `id`/`steps`, the whole set this plays. |
| walkthrough | `string` | — | Controlled active walkthrough id (which one `step` indexes into). |
| defaultWalkthrough | `string` | `id`, else first of `walkthroughs` | Uncontrolled starting walkthrough. |
| onWalkthroughChange | `(id: string) => void` | — | Fires on a chain, a resume, or `start(at, id)`. |
| storage | `WalkthroughStorage \| null` | `createLocalStorageAdapter()` | Where in-progress state is remembered. `null` = nothing. Read once, on mount. |
| currentRoute | `string` | `location.pathname` | Where the host is, compared with `step.route` by string equality. |
| onNavigate | `(step, { walkthrough, index }) => void` | — | Called once when a step with a `route` starts and the host is elsewhere. The host navigates. |
| controller | `WalkthroughController` | — | From `createWalkthroughController()`: signal actions from OUTSIDE this tree (a query client, a module, another React root). Read once, on mount. |

## Chains, other pages, and resume

```ts
interface WalkthroughStorage {
  load(): WalkthroughProgress | null | Promise<WalkthroughProgress | null>;
  save(progress: WalkthroughProgress | null): void | Promise<void>;
  subscribe?(listener: () => void): () => void; // lets a hand-over reach a mounted <Walkthrough>
}
interface WalkthroughProgress {
  walkthrough: string;
  step?: string;   // absent = handed over by a chain, not started yet
  index: number;   // fallback when `step` no longer names a step
}
```

- **Chain**: when a walkthrough with `next` completes, the next one starts in
  place if it is in `walkthroughs`; otherwise `{ walkthrough: next, index: 0 }`
  is saved for the `<Walkthrough>` that has it. Skipping never chains.
- **Route**: a step's `route` that differs from `currentRoute` calls
  `onNavigate` once per step entry (a person wandering off mid-step is not
  dragged back). Until the target registers or `currentRoute` matches, the card
  waits, carries `data-walkthrough-navigating`, and `whenMissing` is held off.
- **Resume**: every step change saves `{ walkthrough, step, index }`; finishing
  or skipping saves `null`. On mount the record is read and, if it names a
  walkthrough this one can play, it resumes there (`walkthrough:resumed`).
  An idle `<Walkthrough>` never writes, so it cannot clear another's progress.
  One in-progress walkthrough per storage key.

## `WalkthroughStep`

| Field | Type | Default | Description |
|------|------|---------|-------------|
| id | `string` | — | Step id. |
| target | `string` | — | A registered target id. Omitted = a centred step over a solid scrim. |
| title | `string` | — | Heading. |
| body | `string` | — | Body copy. |
| bodyFormat | `"text" \| "markdown"` | the walkthrough's | `"markdown"` renders `body` through react-fancy's `ContentRenderer`, sanitised. `"text"` shows it as written. |
| placement | `Placement` | auto | `top` / `bottom` / `left` / `right` (+ `-start` / `-end`). |
| advanceOn | `"next" \| "target-click" \| "event"` | `"next"` | What moves it on. |
| event | `string` | — | The host event, when `advanceOn` is `"event"`. |
| whenMissing | `"wait" \| "skip" \| "fail"` | `"wait"` | What to do if `target` is not mounted. |
| route | `string` | — | The page this step lives on. The host is asked to navigate there (`onNavigate`). |

`advanceOn` is the difference between a tour and a slideshow. `"target-click"`
waits for a real click on the real element **through** the spotlight — the click
reaches your handler as well. `"event"` waits for your app to call
`signal(event)`, which is how you gate on something asynchronous like a saved
record.

## Action-required steps

A step with `advanceOn: "target-click"` or `"event"` asks the person to do
something **in your app**, not in the card. Its card has **no Next and no
Back**: only Skip, the step's text, and the hint. The keyboard does not advance
it either.

```ts
{
  id: "create",
  title: "Create a project",
  body: "Click New project. We continue once it is saved.",
  target: "new-project",       // spotlighted; clicks go through to your button
  advanceOn: "event",
  event: "project:created",
}
```

Use `"event"` with a `target` whenever the click only STARTS the action (a
server round-trip, data coming back, a redirect). Then tell the walkthrough how
it went, from wherever you find out:

```tsx
const { signal, fail } = useWalkthrough();
createProject.mutate(input, {
  onSuccess: () => signal("project:created"),
  onError: (e) => fail("project:created", e.message), // optional
});
```

| Case | What to do |
|---|---|
| **Server confirmation / data returns** | `signal(event)` in the success callback. `signal` always acts on the LATEST state, so a callback captured several renders ago still works. |
| **The server rejects it** | `fail(event, message?)`. The step stays put, the card shows `message` (default `labels.actionFailed`) as `role="alert"`, and `walkthrough:action-failed` is emitted. The next `signal` clears it; so does any step change. |
| **The action sends them to a new page** | Nothing special on the old page: the step is already saved. On the new page, call `signal(event)` when it mounts. That runs BEFORE `<Walkthrough>` has read its storage, so the signal is held and applied to the step it resumes on, once, and only if that step awaits it. |
| **The signal comes from outside the tree** | `const controller = createWalkthroughController()` in a module, `<Walkthrough controller={controller}>`, then `controller.signal(event)` / `controller.fail(event, message)` from anywhere. A message sent while no walkthrough is mounted (mid-visit) is held for the next one, under the same once-only rule. |

The rules, and why:

- **Only the current step's own action counts.** A signal for a later step is
  ignored and not remembered: honouring it would skip the steps between, and a
  duplicate (a double submit) would skip one more.
- **Nothing after dismissal.** Once skipped, a late `signal` or `fail` does
  nothing, and a held one cannot restart the tour, because nothing is left in
  storage to resume.
- **No Back onto an action step.** The person already did that thing in the
  app, and the tour cannot undo it. Going back would ask them to do it twice.
  So the step after an action step offers no Back, and `back()` refuses. A host
  or agent can still move a controlled `step`.
- **`next()` still works** on an action step. It is the host's escape hatch.

Handles on the card wrapper (present with a custom `renderStep` too):
`data-walkthrough-requires-action="event" | "target-click"`,
`data-walkthrough-awaiting="<event>"`, and `data-walkthrough-action-error`
while a failure is showing. The default card's message carries
`data-walkthrough-error`. `renderStep` receives `requiresAction`, `canGoBack`
and `actionError`.

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
| walkthrough | `string \| null` | The active walkthrough's id. |
| start | `(at?: number, walkthrough?: string) => void` | Start, optionally at an index, optionally a named walkthrough. |
| next / back | `() => void` | Move. `back()` refuses to land on an action-required step. |
| skip | `() => void` | End early. Reported as `abandoned`. |
| signal | `(event: string) => void` | The action `event` happened in your app. Advances the current step if it awaits it. |
| fail | `(event: string, message?: string) => void` | The action `event` failed. The step stays put and shows `message`. |
| actionError | `string \| null` | The current step's failure message. |
| registry | `TargetRegistry` | The target registry, for advanced cases. |

## Events

```ts
type WalkthroughEvent =
  | { type: "walkthrough:started";         walkthrough: string; step: string }
  | { type: "walkthrough:step";            walkthrough: string; step: string; index: number }
  | { type: "walkthrough:first-value";     walkthrough: string; step: string }
  | { type: "walkthrough:abandoned";       walkthrough: string; step: string; index: number }
  | { type: "walkthrough:resumed";         walkthrough: string; step: string; index: number }
  | { type: "walkthrough:completed";       walkthrough: string; next?: string }
  | { type: "walkthrough:chained";         walkthrough: string; from: string; to: string }
  | { type: "walkthrough:no-first-value";  walkthrough: string }
  | { type: "walkthrough:error";           walkthrough: string; step: string; reason: string }
  | { type: "walkthrough:action-failed";   walkthrough: string; step: string; event: string; message?: string };
```

An action step that succeeds is reported like any other advance
(`walkthrough:step`, plus `first-value` when it is that step): the person did
the thing. `action-failed` is where people get stuck.

`abandoned` carries the step and index it was abandoned ON, which is the one
number that tells you where a tour loses people.

## See also

- [WalkthroughTarget](./WalkthroughTarget.md) — marking the things a step points at
- [Spotlight](./Spotlight.md) — the scrim and hole, usable on its own
