import { act, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as pkg from "./index";
import { Walkthrough, useWalkthrough, type WalkthroughApi, type WalkthroughProps } from "./Walkthrough";
import type { WalkthroughProgress, WalkthroughStorage } from "./storage";
import type { WalkthroughEvent, WalkthroughStep } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * Action-required steps: the person does something in the APP (not in the
 * card), and the walkthrough moves on when the host says it happened -- after
 * the server confirmed it, after data came back, or on the page the action
 * sent them to.
 */

const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  localStorage.clear();
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const box = this.dataset.box?.split(",").map(Number);
    const [top, left, width, height] = box ?? [0, 0, 0, 0];
    return { top, left, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
});

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const r of roots) r.unmount();
  });
  roots.length = 0;
  document.body.innerHTML = "";
  HTMLElement.prototype.getBoundingClientRect = realRect;
  localStorage.clear();
  vi.restoreAllMocks();
});

function mount(node: ReactNode): Root {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  roots.push(r);
  act(() => r.render(node));
  return r;
}
function unmount(r: Root): void {
  act(() => r.unmount());
  roots.splice(roots.indexOf(r), 1);
}

const card = () => document.querySelector<HTMLElement>("[data-walkthrough-card]");
const action = (name: string) => document.querySelector<HTMLButtonElement>(`[data-walkthrough-action="${name}"]`);
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const types = (events: WalkthroughEvent[]) => events.map((e) => e.type);
const last = <T,>(list: T[]): T | undefined => list[list.length - 1];

/** A store in memory, so a "page change" is an unmount + a fresh mount on the same store. */
function memoryStore(initial: WalkthroughProgress | null = null, async = false): WalkthroughStorage & { value: WalkthroughProgress | null } {
  const store = {
    value: initial,
    load: () => (async ? Promise.resolve(store.value) : store.value),
    save: (p: WalkthroughProgress | null) => {
      store.value = p;
    },
  };
  return store;
}

const STEPS: WalkthroughStep[] = [
  { id: "welcome", title: "Welcome" },
  { id: "create", title: "Create a project", body: "Use the New project button.", target: "new-project", advanceOn: "event", event: "project:created" },
  { id: "name", title: "Name it" },
  { id: "done", title: "Done" },
];

/** Exposes the walkthrough API to the test, captured on every render. */
let api: WalkthroughApi | null = null;
function Probe() {
  api = useWalkthrough();
  return null;
}

function App(props: Partial<WalkthroughProps> & { events?: WalkthroughEvent[]; children?: ReactNode }) {
  const { events, children, ...rest } = props;
  return (
    <Walkthrough id="onboarding" steps={STEPS} firstValue="create" defaultStep={1} animate={false} storage={null} onEvent={(e) => events?.push(e)} {...rest}>
      <Walkthrough.Target id="new-project">
        <button data-box="100,200,120,40" data-testid="new-project">
          New project
        </button>
      </Walkthrough.Target>
      <Probe />
      {children}
    </Walkthrough>
  );
}

describe("the card on an action-required step", () => {
  it("has no Next and no Back -- only Skip, the instruction, and a handle saying what it awaits", () => {
    mount(<App />);
    expect(card()?.dataset.walkthroughCard).toBe("create");
    expect(action("next")).toBeNull();
    expect(action("back")).toBeNull();
    expect(action("skip")).not.toBeNull();
    expect(card()?.textContent).toContain("Use the New project button.");
    expect(card()?.dataset.walkthroughRequiresAction).toBe("event");
    expect(card()?.dataset.walkthroughAwaiting).toBe("project:created");
  });

  it("marks a target-click step too", () => {
    mount(<App steps={[STEPS[0], { ...STEPS[1], advanceOn: "target-click", event: undefined }, STEPS[2]]} />);
    expect(card()?.dataset.walkthroughRequiresAction).toBe("target-click");
    expect(action("next")).toBeNull();
    expect(action("back")).toBeNull();
  });

  it("an ordinary step carries no requires-action handle", () => {
    mount(<App defaultStep={0} />);
    expect(card()?.dataset.walkthroughRequiresAction).toBeUndefined();
    expect(action("next")).not.toBeNull();
  });

  it("Enter and ArrowRight do not advance it, on the card or the document", () => {
    mount(<App />);
    for (const key of ["Enter", "ArrowRight", " "]) {
      act(() => {
        card()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    }
    expect(card()?.dataset.walkthroughCard).toBe("create");
  });

  it("hands renderStep whether the step requires an action", () => {
    const seen: boolean[] = [];
    mount(
      <App
        renderStep={(ctx) => {
          seen.push(ctx.requiresAction);
          return <p>{ctx.step.id}</p>;
        }}
      />,
    );
    expect(last(seen)).toBe(true);
    expect(card()?.dataset.walkthroughRequiresAction).toBe("event");
  });
});

describe("advancing programmatically", () => {
  it("after server confirmation: clicking the real target does not advance; the confirmed signal does", async () => {
    const events: WalkthroughEvent[] = [];
    let resolve: () => void = () => {};
    function CreateButton() {
      const { signal } = useWalkthrough();
      return (
        <button
          data-testid="create-real"
          onClick={() => {
            void new Promise<void>((r) => (resolve = r)).then(() => signal("project:created"));
          }}
        />
      );
    }
    mount(
      <App events={events}>
        <CreateButton />
      </App>,
    );
    click(byTestId("create-real"));
    click(byTestId("new-project"));
    expect(card()?.dataset.walkthroughCard).toBe("create");

    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    expect(card()?.dataset.walkthroughCard).toBe("name");
    // The person did the thing: that IS first value.
    expect(events.find((e) => e.type === "walkthrough:first-value")).toMatchObject({ step: "create" });
  });

  it("a signal captured BEFORE the step was current still advances it (a mutation's onSuccess closes over an old render)", () => {
    let captured: ((event: string) => void) | null = null;
    function Capture() {
      const { signal } = useWalkthrough();
      const once = useRef(false);
      if (!once.current) {
        once.current = true;
        captured = signal;
      }
      return null;
    }
    mount(
      <App defaultStep={0}>
        <Capture />
      </App>,
    );
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("create");
    act(() => captured!("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("a signal for a step that is not current is ignored -- no skipping ahead", () => {
    mount(<App defaultStep={0} />);
    act(() => api!.signal("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("welcome");
    click(action("next"));
    // And it was not remembered for later, either.
    expect(card()?.dataset.walkthroughCard).toBe("create");
  });

  it("a signal arriving after dismissal does nothing", () => {
    const events: WalkthroughEvent[] = [];
    mount(<App events={events} />);
    const { signal, fail } = api!;
    click(action("skip"));
    const before = events.length;
    act(() => {
      signal("project:created");
      fail("project:created", "late");
    });
    expect(card()).toBeNull();
    expect(events.length).toBe(before);
  });

  it("Back is not offered onto an action step: the tour cannot undo what the person did in the app", () => {
    mount(<App />);
    act(() => api!.signal("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
    expect(action("back")).toBeNull();
    act(() => api!.back());
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("Back still works between ordinary steps", () => {
    mount(<App defaultStep={3} />);
    click(action("back"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });
});

describe("when the action fails", () => {
  it("stays put, shows the host's message, reports it, and a retry that succeeds moves on", () => {
    const events: WalkthroughEvent[] = [];
    mount(<App events={events} />);
    act(() => api!.fail("project:created", "The name is taken -- try another."));

    expect(card()?.dataset.walkthroughCard).toBe("create");
    const error = document.querySelector("[data-walkthrough-error]");
    expect(error?.textContent).toBe("The name is taken -- try another.");
    expect(card()?.dataset.walkthroughActionError).toBe("The name is taken -- try another.");
    expect(api!.actionError).toBe("The name is taken -- try another.");
    expect(last(events)).toEqual({
      type: "walkthrough:action-failed",
      walkthrough: "onboarding",
      step: "create",
      event: "project:created",
      message: "The name is taken -- try another.",
    });

    act(() => api!.signal("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
    expect(document.querySelector("[data-walkthrough-error]")).toBeNull();
    expect(api!.actionError).toBeNull();
  });

  it("without a message, shows the actionFailed label", () => {
    mount(<App labels={{ actionFailed: "Nope, again." }} />);
    act(() => api!.fail("project:created"));
    expect(document.querySelector("[data-walkthrough-error]")?.textContent).toBe("Nope, again.");
  });

  it("a failure for an action the step does not await is ignored", () => {
    const events: WalkthroughEvent[] = [];
    mount(<App events={events} />);
    const before = events.length;
    act(() => api!.fail("project:deleted", "x"));
    expect(document.querySelector("[data-walkthrough-error]")).toBeNull();
    expect(events.length).toBe(before);
  });

  it("the error does not follow the walkthrough to another step", () => {
    mount(<App />);
    act(() => api!.fail("project:created", "x"));
    act(() => api!.start(0));
    act(() => api!.next());
    expect(card()?.dataset.walkthroughCard).toBe("create");
    expect(document.querySelector("[data-walkthrough-error]")).toBeNull();
  });

  it("renderStep is handed the error", () => {
    const seen: (string | null)[] = [];
    mount(
      <App
        renderStep={(ctx) => {
          seen.push(ctx.actionError);
          return <p>{ctx.step.id}</p>;
        }}
      />,
    );
    act(() => api!.fail("project:created", "boom"));
    expect(last(seen)).toBe("boom");
  });
});

describe("an action that sends the person to a new page", () => {
  /** The page the action lands on confirms it as it mounts -- e.g. Inertia redirected to /projects/1. */
  function ConfirmOnMount({ event }: { event: string }) {
    const { signal } = useWalkthrough();
    useEffect(() => signal(event), [signal, event]);
    return null;
  }
  /** The same, fired exactly once with the first render's `signal` -- how most pages write "on mount". */
  function ConfirmOnce({ event }: { event: string }) {
    const { signal } = useWalkthrough();
    const first = useRef({ signal, event });
    useEffect(() => first.current.signal(first.current.event), []);
    return null;
  }

  it("a page that confirms ONCE on mount, before the store is even read, still advances the resumed step", () => {
    const store = memoryStore({ walkthrough: "onboarding", step: "create", index: 1 });
    const events: WalkthroughEvent[] = [];
    mount(
      <App storage={store} defaultStep={null} events={events}>
        <ConfirmOnce event="project:created" />
      </App>,
    );
    expect(card()?.dataset.walkthroughCard).toBe("name");
    expect(types(events)).toEqual(["walkthrough:resumed", "walkthrough:step", "walkthrough:first-value", "walkthrough:step"]);
  });

  it("resumes on the action step from storage and advances when the new page signals on mount", () => {
    const store = memoryStore();
    const page1 = mount(<App storage={store} defaultStep={1} />);
    expect(store.value).toEqual({ walkthrough: "onboarding", step: "create", index: 1 });
    unmount(page1); // a full navigation

    const events: WalkthroughEvent[] = [];
    mount(
      <App storage={store} defaultStep={null} events={events}>
        <ConfirmOnMount event="project:created" />
      </App>,
    );
    expect(card()?.dataset.walkthroughCard).toBe("name");
    expect(store.value).toEqual({ walkthrough: "onboarding", step: "name", index: 2 });
    expect(types(events)).toEqual(["walkthrough:resumed", "walkthrough:step", "walkthrough:first-value", "walkthrough:step"]);
  });

  it("the same with a store that loads asynchronously", async () => {
    const store = memoryStore({ walkthrough: "onboarding", step: "create", index: 1 }, true);
    await act(async () => {
      mount(
        <App storage={store} defaultStep={null}>
          <ConfirmOnce event="project:created" />
        </App>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("an early signal that does not match the resumed step is dropped, not held", () => {
    const store = memoryStore({ walkthrough: "onboarding", step: "create", index: 1 });
    mount(
      <App storage={store} defaultStep={null}>
        <ConfirmOnMount event="something:else" />
      </App>,
    );
    expect(card()?.dataset.walkthroughCard).toBe("create");
    act(() => api!.signal("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("a target-click that navigates has saved the NEXT step before the page goes", () => {
    const store = memoryStore();
    const steps: WalkthroughStep[] = [STEPS[0], { ...STEPS[1], advanceOn: "target-click", event: undefined }, STEPS[2], STEPS[3]];
    const page1 = mount(<App storage={store} steps={steps} />);
    click(byTestId("new-project"));
    expect(store.value).toEqual({ walkthrough: "onboarding", step: "name", index: 2 });
    unmount(page1);

    mount(<App storage={store} steps={steps} defaultStep={null} />);
    expect(card()?.dataset.walkthroughCard).toBe("name");
    expect(action("back")).toBeNull();
  });
});

describe("a controller, for signals from outside the tree", () => {
  // Through the package entry: the controller is public API, not an internal.
  const create = () => pkg.createWalkthroughController();

  it("advances a walkthrough it is passed to, from anywhere -- another root, a module, a query client", () => {
    const controller = create();
    mount(<App controller={controller} />);
    act(() => controller.fail("project:created", "rejected"));
    expect(document.querySelector("[data-walkthrough-error]")?.textContent).toBe("rejected");
    act(() => controller.signal("project:created"));
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("holds a signal sent before the walkthrough mounts, and applies it to the resumed step", () => {
    const controller = create();
    const store = memoryStore({ walkthrough: "onboarding", step: "create", index: 1 });
    controller.signal("project:created");
    mount(<App storage={store} defaultStep={null} controller={controller} />);
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });

  it("holds across an unmount (a per-page walkthrough mid-visit) -- but a dismissed tour stays dismissed", () => {
    const controller = create();
    const store = memoryStore();
    const page1 = mount(<App storage={store} controller={controller} />);
    unmount(page1);
    controller.signal("project:created");
    const page2 = mount(<App storage={store} defaultStep={null} controller={controller} />);
    expect(card()?.dataset.walkthroughCard).toBe("name");

    click(action("skip"));
    unmount(page2);
    controller.signal("project:created");
    mount(<App storage={store} defaultStep={null} controller={controller} />);
    expect(card()).toBeNull();
  });

  it("a held signal is used once: it does not advance a step that comes up later", () => {
    const controller = create();
    controller.signal("project:created");
    mount(<App defaultStep={0} controller={controller} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("create");
  });

  it("is safe to create at module scope with no DOM", () => {
    expect(() => create()).not.toThrow();
  });
});

describe("controlled state stays controlled", () => {
  it("an action advance is reported through onStepChange and follows the host", () => {
    const changes: (number | null)[] = [];
    function Controlled() {
      const [step, setStep] = useState<number | null>(1);
      return (
        <App
          defaultStep={undefined}
          step={step}
          onStepChange={(s) => {
            changes.push(s);
            setStep(s);
          }}
        />
      );
    }
    mount(<Controlled />);
    act(() => api!.signal("project:created"));
    expect(changes).toEqual([2]);
    expect(card()?.dataset.walkthroughCard).toBe("name");
  });
});
