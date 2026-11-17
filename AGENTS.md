# Using @particle-academy/fancy-walkthrough — guide for agents

How an agent installs and uses this package in a consumer app. What the package
is, is in [README.md](./README.md). Notes for working ON this repo's code are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```bash
npm install @particle-academy/fancy-walkthrough @particle-academy/react-fancy
```

- **Peers:** `react ^19`, `react-dom ^19`, `@particle-academy/react-fancy >=5.27 <7`,
  `tailwindcss ^4`.
- **Node:** `>=22`.
- Add both packages to the app's Tailwind sources:

  ```css
  @source "../node_modules/@particle-academy/react-fancy/dist/**/*.js";
  @source "../node_modules/@particle-academy/fancy-walkthrough/dist/**/*.js";
  ```

## Find it on the Fancy MCP server

The catalog server is `https://ui.particle.academy/mcp` (streamable HTTP, no API
key; MCP id `fancy-ui`). The package is the registry entry `fancy-walkthrough`;
`install-instructions` and `get-component` take that slug, and
`search-components` finds it under "walkthrough" / "tour".

Per-component docs ship in the package under `docs/` (`Walkthrough.md`,
`WalkthroughTarget.md`, `Spotlight.md`).

## API essentials

- A walkthrough is a JSON `WalkthroughDocument`: `{ id, firstValue, steps, next? }`.
  Each step: `id`, optional `target`, `title`, `body`, `bodyFormat`,
  `placement`, `advanceOn` (`next | target-click | event`), `event`,
  `whenMissing` (`wait | skip | fail`), `route`.
- `<Walkthrough {...doc} onEvent={track}>` wraps the app; targets register with
  `<Walkthrough.Target id>` (adds no box) or `useWalkthroughTarget(id)` as a ref.
- `useWalkthrough()` gives `start`, `next`, `back`, `skip`, `signal`, `fail`.
- **Controlled:** `step={index | null}` + `onStepChange`, or uncontrolled with
  `defaultStep`.
- Outside the React tree: `createWalkthroughController()`, passed as
  `<Walkthrough controller>`, then `controller.signal(event)`.
- Several walkthroughs across pages: `walkthroughs={[...]}`, `currentRoute`,
  `onNavigate(step)`; progress goes through `storage={{ load, save }}`
  (default `createLocalStorageAdapter()`, `storage={null}` for none).
- Targets in another React root: one `createWalkthroughRegistry()`, passed to
  `<Walkthrough registry>` and to every target or `<WalkthroughTargetsProvider registry>`.

## Traps

- **Every document should declare `firstValue`.** `walkthrough:first-value` is
  the activation metric; `walkthrough:completed` is deliberately not. A missing
  one emits `walkthrough:no-first-value` and warns in development.
- **Moving `step` yourself never counts as first value.** Only the person moving
  forward does. Neither does a step skipped by `whenMissing: "skip"`.
- **The package never navigates.** `onNavigate` asks your router; nothing moves
  pages for you.
- **When a click only starts an action** (a save, a redirect), use
  `advanceOn: "event"` and call `signal(event)` on success, `fail(event, message)`
  on error. A signal for a step that is not current is ignored.
- **Target ids are the contract.** There are no selectors; a step whose target
  never registers waits (by default) and says so.
- An unstyled card means Tailwind is not scanning both `dist/` folders.
