import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Walkthrough, useWalkthrough, type WalkthroughProps } from "./Walkthrough";
import { createLocalStorageAdapter, type WalkthroughProgress, type WalkthroughStorage } from "./storage";
import type { WalkthroughDocument, WalkthroughEvent, WalkthroughStep } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * fancy-walkthrough#2. Walkthroughs that chain -- one ends, the next starts --
 * including when the next step lives on another page, and an in-progress chain
 * that survives the page change and a full reload.
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
const scrim = () => document.querySelector<HTMLElement>("[data-walkthrough-scrim]");
const action = (name: string) => document.querySelector<HTMLButtonElement>(`[data-walkthrough-action="${name}"]`);
const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const types = (events: WalkthroughEvent[]) => events.map((e) => e.type);

const LAYOUT: WalkthroughDocument = {
  id: "layout",
  firstValue: "menu",
  next: "dashboard",
  steps: [
    { id: "hello", title: "Hello" },
    { id: "menu", title: "Menu" },
  ],
};
const DASHBOARD: WalkthroughDocument = {
  id: "dashboard",
  firstValue: "chart",
  steps: [
    { id: "chart", title: "Chart" },
    { id: "bye", title: "Bye" },
  ],
};

describe("a chain inside one <Walkthrough>", () => {
  it("finishing a walkthrough starts its `next`, and reports the handover", () => {
    const events: WalkthroughEvent[] = [];
    mount(
      <Walkthrough walkthroughs={[LAYOUT, DASHBOARD]} defaultWalkthrough="layout" defaultStep={0} animate={false} storage={null} onEvent={(e) => events.push(e)} />,
    );
    expect(card()?.dataset.walkthroughCard).toBe("hello");
    click(action("next"));
    click(action("next")); // Done on the last step of `layout`

    expect(card()?.dataset.walkthroughCard).toBe("chart");
    expect(card()?.dataset.walkthroughId).toBe("dashboard");
    const after = events.slice(events.findIndex((e) => e.type === "walkthrough:first-value"));
    expect(after).toEqual([
      { type: "walkthrough:first-value", walkthrough: "layout", step: "menu" },
      { type: "walkthrough:completed", walkthrough: "layout", next: "dashboard" },
      { type: "walkthrough:chained", walkthrough: "layout", from: "layout", to: "dashboard" },
      { type: "walkthrough:started", walkthrough: "dashboard", step: "chart" },
      { type: "walkthrough:step", walkthrough: "dashboard", step: "chart", index: 0 },
    ]);
  });

  it("a spread document with `next` chains into the library", () => {
    mount(<Walkthrough {...LAYOUT} walkthroughs={[DASHBOARD]} defaultStep={1} animate={false} storage={null} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("chart");
  });

  it("the active walkthrough is controllable: onWalkthroughChange reports the chain", () => {
    const changes: string[] = [];
    function Host() {
      const [active, setActive] = useState("layout");
      return (
        <Walkthrough
          walkthroughs={[LAYOUT, DASHBOARD]}
          walkthrough={active}
          onWalkthroughChange={(id) => {
            changes.push(id);
            setActive(id);
          }}
          defaultStep={1}
          animate={false}
          storage={null}
        />
      );
    }
    mount(<Host />);
    click(action("next"));
    expect(changes).toEqual(["dashboard"]);
    expect(card()?.dataset.walkthroughCard).toBe("chart");
  });

  it("skipping does not chain", () => {
    const events: WalkthroughEvent[] = [];
    mount(<Walkthrough walkthroughs={[LAYOUT, DASHBOARD]} defaultStep={0} animate={false} storage={null} onEvent={(e) => events.push(e)} />);
    click(action("skip"));
    expect(card()).toBeNull();
    expect(types(events)).not.toContain("walkthrough:chained");
  });

  it("start(at, walkthrough) starts a named walkthrough", () => {
    function Starter() {
      const { start, walkthrough } = useWalkthrough();
      return (
        <button data-testid="go" data-active={walkthrough ?? ""} onClick={() => start(1, "dashboard")}>
          go
        </button>
      );
    }
    mount(
      <Walkthrough walkthroughs={[LAYOUT, DASHBOARD]} animate={false} storage={null}>
        <Starter />
      </Walkthrough>,
    );
    expect(card()).toBeNull();
    click(document.querySelector("[data-testid=go]"));
    expect(card()?.dataset.walkthroughCard).toBe("bye");
    expect(document.querySelector<HTMLElement>("[data-testid=go]")?.dataset.active).toBe("dashboard");
  });
});

describe("a chain across separate <Walkthrough>s", () => {
  it("hands over to a walkthrough mounted elsewhere on the page", () => {
    const events: WalkthroughEvent[] = [];
    mount(<Walkthrough {...LAYOUT} defaultStep={1} animate={false} onEvent={(e) => events.push(e)} />);
    mount(<Walkthrough {...DASHBOARD} animate={false} onEvent={(e) => events.push(e)} />);

    click(action("next"));
    expect(card()?.dataset.walkthroughId).toBe("dashboard");
    expect(card()?.dataset.walkthroughCard).toBe("chart");
    expect(events).toContainEqual({ type: "walkthrough:chained", walkthrough: "layout", from: "layout", to: "dashboard" });
    expect(events).toContainEqual({ type: "walkthrough:started", walkthrough: "dashboard", step: "chart" });
  });

  it("hands over to a walkthrough that mounts LATER -- on the next page", () => {
    const page1 = mount(<Walkthrough {...LAYOUT} defaultStep={1} animate={false} />);
    click(action("next"));
    expect(card()).toBeNull();
    unmount(page1);

    const events: WalkthroughEvent[] = [];
    mount(<Walkthrough {...DASHBOARD} animate={false} onEvent={(e) => events.push(e)} />);
    expect(card()?.dataset.walkthroughCard).toBe("chart");
    expect(types(events)[0]).toBe("walkthrough:started");
  });
});

describe("resume", () => {
  it("survives a remount (a full reload): same walkthrough, same step, reported as resumed", () => {
    const first = mount(<Walkthrough {...DASHBOARD} defaultStep={0} animate={false} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("bye");
    unmount(first);

    const events: WalkthroughEvent[] = [];
    mount(<Walkthrough {...DASHBOARD} animate={false} onEvent={(e) => events.push(e)} />);
    expect(card()?.dataset.walkthroughCard).toBe("bye");
    expect(events).toEqual([
      { type: "walkthrough:resumed", walkthrough: "dashboard", step: "bye", index: 1 },
      { type: "walkthrough:step", walkthrough: "dashboard", step: "bye", index: 1 },
    ]);
  });

  it("resumes by step id when the steps were reordered", () => {
    const first = mount(<Walkthrough {...DASHBOARD} defaultStep={1} animate={false} />);
    unmount(first);
    mount(<Walkthrough id="dashboard" steps={[DASHBOARD.steps[1], DASHBOARD.steps[0]]} animate={false} />);
    expect(card()?.dataset.walkthroughCard).toBe("bye");
  });

  it("an abandoned walkthrough does not come back", () => {
    const first = mount(<Walkthrough {...DASHBOARD} defaultStep={0} animate={false} />);
    click(action("skip"));
    unmount(first);
    mount(<Walkthrough {...DASHBOARD} animate={false} />);
    expect(card()).toBeNull();
  });

  it("a completed walkthrough with no `next` does not come back", () => {
    const first = mount(<Walkthrough {...DASHBOARD} defaultStep={1} animate={false} />);
    click(action("next"));
    unmount(first);
    mount(<Walkthrough {...DASHBOARD} animate={false} />);
    expect(card()).toBeNull();
  });

  it("ignores progress that belongs to another walkthrough", () => {
    const first = mount(<Walkthrough {...LAYOUT} defaultStep={0} animate={false} />);
    unmount(first);
    mount(<Walkthrough {...DASHBOARD} animate={false} />);
    expect(card()).toBeNull();
  });

  it("an idle walkthrough on the page never clears another's progress", () => {
    mount(<Walkthrough {...LAYOUT} defaultStep={1} animate={false} />);
    mount(<Walkthrough {...DASHBOARD} animate={false} />);
    expect(JSON.parse(localStorage.getItem("fancy-walkthrough") ?? "null")).toEqual({ walkthrough: "layout", step: "menu", index: 1 });
  });

  it("storage={null} persists nothing", () => {
    const first = mount(<Walkthrough {...DASHBOARD} defaultStep={1} animate={false} storage={null} />);
    unmount(first);
    expect(localStorage.length).toBe(0);
    mount(<Walkthrough {...DASHBOARD} animate={false} storage={null} />);
    expect(card()).toBeNull();
  });
});

describe("the storage adapter", () => {
  it("is { load, save }, and save receives { walkthrough, step, index }", () => {
    const saved: (WalkthroughProgress | null)[] = [];
    const storage: WalkthroughStorage = { load: () => null, save: (p) => void saved.push(p) };
    mount(<Walkthrough {...DASHBOARD} defaultStep={0} animate={false} storage={storage} />);
    click(action("next"));
    click(action("next"));
    expect(saved).toEqual([
      { walkthrough: "dashboard", step: "chart", index: 0 },
      { walkthrough: "dashboard", step: "bye", index: 1 },
      null,
    ]);
  });

  it("a chain hand-over is saved with no step: the next walkthrough has not started yet", () => {
    const saved: (WalkthroughProgress | null)[] = [];
    mount(<Walkthrough {...LAYOUT} defaultStep={1} animate={false} storage={{ load: () => null, save: (p) => void saved.push(p) }} />);
    click(action("next"));
    expect(saved[saved.length - 1]).toEqual({ walkthrough: "dashboard", index: 0 });
  });

  it("load may be async", async () => {
    const storage: WalkthroughStorage = {
      load: () => Promise.resolve({ walkthrough: "dashboard", step: "bye", index: 1 }),
      save: () => {},
    };
    mount(<Walkthrough {...DASHBOARD} animate={false} storage={storage} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(card()?.dataset.walkthroughCard).toBe("bye");
  });

  it("the localStorage adapter takes a key, and survives garbage in it", () => {
    localStorage.setItem("mine", "{not json");
    const adapter = createLocalStorageAdapter("mine");
    expect(adapter.load()).toBeNull();
    adapter.save({ walkthrough: "a", step: "s", index: 2 });
    expect(JSON.parse(localStorage.getItem("mine")!)).toEqual({ walkthrough: "a", step: "s", index: 2 });
    adapter.save(null);
    expect(localStorage.getItem("mine")).toBeNull();
  });

  it("the localStorage adapter survives a storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const adapter = createLocalStorageAdapter();
    expect(adapter.load()).toBeNull();
    expect(() => adapter.save({ walkthrough: "a", index: 0 })).not.toThrow();
  });
});

describe("steps on another page", () => {
  const ACCOUNT: WalkthroughStep[] = [
    { id: "intro", title: "Intro" },
    { id: "prefs", title: "Correspondence", target: "prefs", route: "/settings", whenMissing: "skip" },
    { id: "end", title: "End" },
  ];

  /** A fake host router: the walkthrough lives in the layout, pages swap below it. */
  function Site(props: Partial<WalkthroughProps> & { initial?: string; navigate?: (step: WalkthroughStep) => void; manual?: boolean }) {
    const { initial = "/", navigate, manual, ...rest } = props;
    const [page, setPage] = useState(initial);
    return (
      <Walkthrough
        id="account"
        steps={ACCOUNT}
        firstValue="prefs"
        animate={false}
        currentRoute={page}
        onNavigate={(step) => {
          navigate?.(step);
          if (!manual && step.route) setPage(step.route);
        }}
        {...rest}
      >
        <nav>
          <button data-testid="to-settings" onClick={() => setPage("/settings")}>
            settings
          </button>
        </nav>
        {page === "/" && <main data-page="home">home</main>}
        {page === "/settings" && (
          <main data-page="settings">
            <Walkthrough.Target id="prefs">
              <button data-box="100,100,80,30">Prefs</button>
            </Walkthrough.Target>
          </main>
        )}
      </Walkthrough>
    );
  }

  it("asks the HOST to navigate, and the card finds its target on the new page", () => {
    const navigate = vi.fn();
    mount(<Site defaultStep={0} navigate={navigate} storage={null} />);
    click(action("next"));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].id).toBe("prefs");
    expect(document.querySelector("[data-page=settings]")).not.toBeNull();
    expect(card()?.dataset.walkthroughCard).toBe("prefs");
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });

  it("waits while the host is still navigating -- even under whenMissing: 'skip'", () => {
    // `manual`: the host has been asked but has not arrived yet.
    mount(<Site defaultStep={0} manual storage={null} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("prefs");
    expect(card()?.dataset.walkthroughNavigating).toBe("/settings");
    expect(card()?.querySelector("[data-walkthrough-waiting]")).not.toBeNull();

    click(document.querySelector("[data-testid=to-settings]"));
    expect(card()?.dataset.walkthroughNavigating).toBeUndefined();
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });

  it("does not navigate when the host is already on the step's route", () => {
    const navigate = vi.fn();
    mount(<Site initial="/settings" defaultStep={1} navigate={navigate} storage={null} />);
    expect(navigate).not.toHaveBeenCalled();
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });

  it("applies the missing-target policy once the host has arrived and the target is still absent", () => {
    const steps: WalkthroughStep[] = [
      { id: "intro", title: "Intro" },
      { id: "ghost", title: "Ghost", target: "nowhere", route: "/settings", whenMissing: "skip" },
      { id: "end", title: "End" },
    ];
    mount(<Site steps={steps} defaultStep={0} storage={null} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("end");
  });

  it("navigates once per step, not again when the person wanders off", () => {
    const navigate = vi.fn();
    function Wander() {
      const [page, setPage] = useState("/");
      return (
        <Walkthrough id="account" steps={ACCOUNT} firstValue="prefs" defaultStep={1} animate={false} storage={null} currentRoute={page} onNavigate={(s) => { navigate(s); setPage(s.route!); }}>
          <button data-testid="home" onClick={() => setPage("/")}>home</button>
        </Walkthrough>
      );
    }
    mount(<Wander />);
    expect(navigate).toHaveBeenCalledTimes(1);
    click(document.querySelector("[data-testid=home]"));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("a chain survives a page change AND a reload, and resumes on the right page without navigating", () => {
    const first = mount(<Site defaultStep={0} />);
    click(action("next"));
    expect(card()?.dataset.walkthroughCard).toBe("prefs");
    unmount(first); // the reload

    const navigate = vi.fn();
    mount(<Site initial="/settings" navigate={navigate} />);
    expect(card()?.dataset.walkthroughCard).toBe("prefs");
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a resume onto the wrong page asks the host to navigate", () => {
    const first = mount(<Site defaultStep={0} />);
    click(action("next"));
    unmount(first);

    const navigate = vi.fn();
    mount(<Site initial="/" navigate={navigate} />);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });

  it("without currentRoute it compares the step's route to location.pathname", () => {
    const navigate = vi.fn();
    mount(<Walkthrough id="a" steps={[{ id: "x", title: "X", route: "/elsewhere" }]} defaultStep={0} animate={false} storage={null} onNavigate={navigate} />);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("the first step of a chained walkthrough can live on another page", () => {
    const navigate = vi.fn();
    const settings: WalkthroughDocument = { id: "settings", firstValue: "prefs", steps: [{ id: "prefs", title: "Prefs", target: "prefs", route: "/settings" }] };
    const home: WalkthroughDocument = { id: "home", firstValue: "intro", next: "settings", steps: [{ id: "intro", title: "Intro" }] };
    mount(<Site id={undefined} steps={undefined} walkthroughs={[home, settings]} defaultStep={0} navigate={navigate} storage={null} />);
    click(action("next"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(card()?.dataset.walkthroughId).toBe("settings");
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });
});
