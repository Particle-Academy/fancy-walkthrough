import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Walkthrough, useWalkthrough, type WalkthroughProps } from "./Walkthrough";
import { useWalkthroughTarget } from "./registry";
import type { WalkthroughEvent, WalkthroughStep } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lays nothing out. An element with `data-box="top,left,width,height"`
// reports that box; everything else reports zeros, as jsdom does.
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const box = this.dataset.box?.split(",").map(Number);
    const [top, left, width, height] = box ?? [0, 0, 0, 0];
    return { top, left, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = "";
  HTMLElement.prototype.getBoundingClientRect = realRect;
  // Tests that stub scrollIntoView set it on HTMLElement.prototype, shadowing
  // whatever Element.prototype has. Removing the own property restores it.
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  vi.restoreAllMocks();
});

function render(node: ReactNode): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

const card = () => document.querySelector<HTMLElement>("[data-walkthrough-card]");
const scrim = () => document.querySelector<HTMLElement>("[data-walkthrough-scrim]");
const ring = () => document.querySelector<SVGRectElement>("[data-walkthrough-ring]");
const action = (name: string) => document.querySelector<HTMLButtonElement>(`[data-walkthrough-action="${name}"]`);
const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const last = <T,>(list: T[]): T | undefined => list[list.length - 1];

const STEPS: WalkthroughStep[] = [
  { id: "welcome", title: "Welcome" },
  { id: "create", title: "Create a project", target: "new-project" },
  { id: "done", title: "You're set" },
];

function App(props: Partial<WalkthroughProps> & { events?: WalkthroughEvent[]; children?: ReactNode }) {
  const { events, children, ...rest } = props;
  return (
    <Walkthrough
      id="onboarding"
      steps={STEPS}
      firstValue="create"
      defaultStep={0}
      animate={false}
      onEvent={(e) => events?.push(e)}
      {...rest}
    >
      {children ?? (
        <Walkthrough.Target id="new-project">
          <button data-box="100,200,120,40" data-testid="new-project">
            New project
          </button>
        </Walkthrough.Target>
      )}
    </Walkthrough>
  );
}

describe("running a walkthrough", () => {
  it("renders the current step and reports the start", () => {
    const events: WalkthroughEvent[] = [];
    render(<App events={events} />);

    expect(card()?.dataset.walkthroughCard).toBe("welcome");
    expect(card()?.textContent).toContain("Welcome");
    expect(card()?.textContent).toContain("1 of 3");
    expect(events.map((e) => e.type)).toEqual(["walkthrough:started", "walkthrough:step"]);
  });

  it("renders nothing until started", () => {
    render(<App defaultStep={null} />);
    expect(card()).toBeNull();
    expect(scrim()).toBeNull();
  });

  it("Next advances and Done completes, and the first-value step is reported on completion", () => {
    const events: WalkthroughEvent[] = [];
    render(<App events={events} />);

    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("create");
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("done");
    click(action("next"));

    expect(card()).toBeNull();
    expect(events.map((e) => e.type)).toEqual([
      "walkthrough:started",
      "walkthrough:step",
      "walkthrough:step",
      "walkthrough:first-value",
      "walkthrough:step",
      "walkthrough:completed",
    ]);
    expect(events.find((e) => e.type === "walkthrough:first-value")).toMatchObject({ step: "create" });
  });

  it("Back goes back and is not first value", () => {
    const events: WalkthroughEvent[] = [];
    render(<App events={events} defaultStep={2} />);

    click(action("back"));
    expect(card()?.dataset.walkthroughCard).toBe("create");
    expect(events.some((e) => e.type === "walkthrough:first-value")).toBe(false);
  });

  it("Skip ends it, reported as abandoned on the step it happened", () => {
    const events: WalkthroughEvent[] = [];
    render(<App events={events} defaultStep={1} />);

    click(action("skip"));

    expect(card()).toBeNull();
    expect(last(events)).toEqual({ type: "walkthrough:abandoned", walkthrough: "onboarding", step: "create", index: 1 });
  });

  it("Escape ends it too", () => {
    const events: WalkthroughEvent[] = [];
    render(<App events={events} />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(card()).toBeNull();
    expect(last(events)?.type).toBe("walkthrough:abandoned");
  });
});

describe("first value", () => {
  it("warns and reports when no first-value step is declared, but still runs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: WalkthroughEvent[] = [];
    render(<App events={events} firstValue={undefined} />);

    expect(card()).not.toBeNull();
    expect(events.map((e) => e.type)).toContain("walkthrough:no-first-value");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("declares no firstValue"));
  });

  it("treats a firstValue that names no step as undeclared", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: WalkthroughEvent[] = [];
    render(<App events={events} firstValue="creat" />);

    expect(events.map((e) => e.type)).toContain("walkthrough:no-first-value");
  });
});

describe("controlled", () => {
  function Controlled({ events }: { events: WalkthroughEvent[] }) {
    const [step, setStep] = useState<number | null>(1);
    return (
      <>
        <button data-testid="host-next" onClick={() => setStep((s) => (s === null ? 0 : s + 1))}>
          host next
        </button>
        <App events={events} step={step} onStepChange={setStep} defaultStep={undefined} />
      </>
    );
  }

  it("follows the host's step", () => {
    const events: WalkthroughEvent[] = [];
    render(<Controlled events={events} />);
    expect(card()?.dataset.walkthroughCard).toBe("create");

    click(document.querySelector("[data-testid=host-next]"));
    expect(card()?.dataset.walkthroughCard).toBe("done");
  });

  it("does NOT count a host moving past the first-value step as first value", () => {
    // Moving the walkthrough on is not the person doing the thing. An agent
    // driving the bridge would otherwise manufacture activation.
    const events: WalkthroughEvent[] = [];
    render(<Controlled events={events} />);

    click(document.querySelector("[data-testid=host-next]"));

    expect(events.some((e) => e.type === "walkthrough:first-value")).toBe(false);
    expect(last(events)).toMatchObject({ type: "walkthrough:step", step: "done" });
  });

  it("reports its own Next through onStepChange", () => {
    const onStepChange = vi.fn();
    render(<App step={0} onStepChange={onStepChange} defaultStep={undefined} />);

    click(action("next"));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });
});

describe("guided action", () => {
  it("advanceOn target-click advances when the person clicks the real target", () => {
    const steps: WalkthroughStep[] = [
      { id: "create", title: "Create", target: "new-project", advanceOn: "target-click" },
      { id: "after", title: "After" },
    ];
    render(<App steps={steps} />);

    expect(action("next")).toBeNull();
    expect(card()?.textContent).toContain("Click the highlighted element");

    click(document.querySelector("[data-testid=new-project]"));
    expect(card()?.dataset.walkthroughCard).toBe("after");
  });

  it("advanceOn event advances on the matching signal only", () => {
    const steps: WalkthroughStep[] = [
      { id: "save", title: "Save", advanceOn: "event", event: "project:saved" },
      { id: "after", title: "After" },
    ];
    function Signals() {
      const { signal } = useWalkthrough();
      return (
        <>
          <button data-testid="wrong" onClick={() => signal("project:deleted")} />
          <button data-testid="right" onClick={() => signal("project:saved")} />
        </>
      );
    }
    render(
      <App steps={steps} firstValue="save">
        <Signals />
      </App>,
    );

    click(document.querySelector("[data-testid=wrong]"));
    expect(card()?.dataset.walkthroughCard).toBe("save");

    click(document.querySelector("[data-testid=right]"));
    expect(card()?.dataset.walkthroughCard).toBe("after");
  });
});

describe("the spotlight", () => {
  it("cuts a hole over the target, padded", () => {
    render(<App defaultStep={1} padding={4} />);

    expect(scrim()?.dataset.walkthroughHole).toBe("open");
    const r = ring()!;
    expect([r.getAttribute("x"), r.getAttribute("y"), r.getAttribute("width"), r.getAttribute("height")]).toEqual([
      "196",
      "96",
      "128",
      "48",
    ]);
  });

  it("clips the hole to a scrolling panel the target sits in", () => {
    // The target's box runs 30px past the bottom of its overflow:auto panel.
    // The hole must stop at the panel edge.
    render(
      <App defaultStep={1} padding={0}>
        <div data-box="50,50,400,100" style={{ overflow: "auto" }}>
          <Walkthrough.Target id="new-project">
            <button data-box="120,100,80,60">New project</button>
          </Walkthrough.Target>
        </div>
      </App>,
    );

    const r = ring()!;
    expect([r.getAttribute("y"), r.getAttribute("height")]).toEqual(["120", "30"]);
  });

  it("lets clicks through the hole: only the scrim path takes pointer events", () => {
    render(<App defaultStep={1} />);

    const svg = scrim()!.querySelector("svg")!;
    const path = svg.querySelector("path")!;
    expect(scrim()!.style.pointerEvents).toBe("none");
    expect(svg.style.pointerEvents).toBe("none");
    expect(path.style.pointerEvents).toBe("auto");
    expect(path.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("is solid for a centred step, and the card is centred", () => {
    render(<App />);

    expect(scrim()?.dataset.walkthroughHole).toBe("closed");
    expect(card()?.dataset.walkthroughPlacement).toBe("center");
  });

  it("re-measures on scroll inside any container", async () => {
    render(<App defaultStep={1} padding={0} />);
    const target = document.querySelector<HTMLElement>("[data-testid=new-project]")!;

    target.dataset.box = "300,200,120,40";
    await act(async () => {
      document.body.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(ring()?.getAttribute("y")).toBe("300");
  });
});

describe("scrolling a target into view", () => {
  it("scrolls an off-screen target into view once, and not again on the person's own scroll", async () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    render(
      <App defaultStep={1}>
        <Walkthrough.Target id="new-project">
          <button data-box="2000,10,100,30">below the fold</button>
        </Walkthrough.Target>
      </App>,
    );
    expect(scrolled).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it("scrolls it into view again after a resize pushes it off-screen", async () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    render(
      <App defaultStep={1}>
        <Walkthrough.Target id="new-project">
          <button data-box="2000,10,100,30">below the fold</button>
        </Walkthrough.Target>
      </App>,
    );
    expect(scrolled).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(scrolled).toHaveBeenCalledTimes(2);
  });
});

describe("a missing target", () => {
  const steps = (whenMissing: WalkthroughStep["whenMissing"]): WalkthroughStep[] => [
    { id: "ghost", title: "Ghost", target: "not-here", whenMissing },
    { id: "after", title: "After" },
  ];

  it("waits by default: centred, solid, and says so -- never a silent skip", () => {
    render(<App steps={steps(undefined)} firstValue="after" />);

    expect(card()?.dataset.walkthroughCard).toBe("ghost");
    expect(card()?.querySelector("[data-walkthrough-waiting]")).not.toBeNull();
    expect(scrim()?.dataset.walkthroughHole).toBe("closed");
  });

  it("opens the hole when the target mounts while waiting", () => {
    function Late() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button data-testid="show" onClick={() => setShown(true)} />
          {shown && (
            <Walkthrough.Target id="not-here">
              <span data-box="10,10,50,20">late</span>
            </Walkthrough.Target>
          )}
        </>
      );
    }
    render(
      <App steps={steps(undefined)} firstValue="after">
        <Late />
      </App>,
    );
    expect(scrim()?.dataset.walkthroughHole).toBe("closed");

    click(document.querySelector("[data-testid=show]"));

    expect(scrim()?.dataset.walkthroughHole).toBe("open");
    expect(card()?.querySelector("[data-walkthrough-waiting]")).toBeNull();
  });

  it("does not skip a target that mounts in the SAME commit as the step change", () => {
    // The step's target renders in the same update that moves the walkthrough
    // onto it -- a route change, a tab switch. `missing` is computed during
    // render, before the target's layout effect registers it; acting on that
    // stale value skipped a step whose target was, by then, right there.
    const steps: WalkthroughStep[] = [
      { id: "intro", title: "Intro" },
      { id: "panel", title: "Panel", target: "late-panel", whenMissing: "skip" },
      { id: "after", title: "After" },
    ];
    function SameCommit() {
      const [step, setStep] = useState<number | null>(0);
      const [shown, setShown] = useState(false);
      return (
        <Walkthrough id="race" steps={steps} firstValue="after" step={step} onStepChange={setStep} animate={false}>
          <button
            data-testid="go"
            onClick={() => {
              setShown(true);
              setStep(1);
            }}
          />
          {shown && (
            <Walkthrough.Target id="late-panel">
              <div data-box="10,10,100,100">panel</div>
            </Walkthrough.Target>
          )}
        </Walkthrough>
      );
    }
    render(<SameCommit />);

    click(document.querySelector("[data-testid=go]"));

    expect(card()?.dataset.walkthroughCard).toBe("panel");
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });

  it("skip moves on -- and a skipped first-value step is NOT first value", () => {
    const events: WalkthroughEvent[] = [];
    render(<App steps={steps("skip")} firstValue="ghost" events={events} />);

    expect(card()?.dataset.walkthroughCard).toBe("after");
    expect(events.some((e) => e.type === "walkthrough:first-value")).toBe(false);
  });

  it("fail stops the walkthrough and reports why, not as an abandonment", () => {
    const events: WalkthroughEvent[] = [];
    render(<App steps={steps("fail")} firstValue="after" events={events} />);

    expect(card()).toBeNull();
    expect(last(events)).toEqual({
      type: "walkthrough:error",
      walkthrough: "onboarding",
      step: "ghost",
      reason: 'target "not-here" is not mounted',
    });
    expect(events.some((e) => e.type === "walkthrough:abandoned")).toBe(false);
  });
});

describe("targets", () => {
  it("Walkthrough.Target registers its first element child without adding a box", () => {
    render(<App defaultStep={null} />);

    const wrapper = document.querySelector<HTMLElement>('[data-walkthrough-target="new-project"]')!;
    expect(wrapper.style.display).toBe("contents");
    expect(wrapper.firstElementChild?.getAttribute("data-testid")).toBe("new-project");
  });

  it("useWalkthroughTarget registers a component's own element", () => {
    function Custom() {
      const ref = useWalkthroughTarget("new-project");
      return <div ref={ref} data-box="5,6,7,8" />;
    }
    render(
      <App defaultStep={1} padding={0}>
        <Custom />
      </App>,
    );

    expect(ring()?.getAttribute("x")).toBe("6");
  });

  it("custom renderStep replaces the card but keeps the spotlight", () => {
    render(
      <App
        defaultStep={1}
        renderStep={({ step, next }) => (
          <button data-testid="custom" onClick={next}>
            {step.title}!
          </button>
        )}
      />,
    );

    expect(document.querySelector("[data-testid=custom]")?.textContent).toBe("Create a project!");
    expect(action("next")).toBeNull();
    expect(scrim()?.dataset.walkthroughHole).toBe("open");

    click(document.querySelector("[data-testid=custom]"));
    expect(card()?.dataset.walkthroughCard).toBe("done");
  });
});
