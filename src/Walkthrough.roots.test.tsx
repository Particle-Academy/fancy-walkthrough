import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Walkthrough } from "./Walkthrough";
import {
  createWalkthroughRegistry,
  useWalkthroughTarget,
  WalkthroughTargetsProvider,
} from "./registry";
import type { WalkthroughStep } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * fancy-walkthrough#1. A Laravel layout mounts its chrome as separate React
 * roots (Blade islands) beside the Inertia page. A target in another root is in
 * another tree, so context cannot reach it: it never registered and its step
 * waited forever. A registry the host creates once and hands to every root
 * fixes that without anyone querying the DOM.
 */

const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
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
  // In-progress state persists through localStorage by default (0.3).
  localStorage.clear();
});

/** Mount `node` in a NEW React root, as a Blade island would. */
function island(node: ReactNode): Root {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  roots.push(r);
  act(() => r.render(node));
  return r;
}

const card = () => document.querySelector<HTMLElement>("[data-walkthrough-card]");
const scrim = () => document.querySelector<HTMLElement>("[data-walkthrough-scrim]");
const ring = () => document.querySelector<SVGRectElement>("[data-walkthrough-ring]");

const STEPS: WalkthroughStep[] = [{ id: "menu", title: "Your menu", target: "user-menu" }];

describe("targets in another React root", () => {
  it("without a shared registry, a target in another root is never seen (the bug)", () => {
    island(<Walkthrough id="layout" steps={STEPS} firstValue="menu" defaultStep={0} animate={false} />);
    island(
      <Walkthrough.Target id="user-menu">
        <button data-box="10,20,30,40">Menu</button>
      </Walkthrough.Target>,
    );

    expect(card()?.querySelector("[data-walkthrough-waiting]")).not.toBeNull();
    expect(scrim()?.dataset.walkthroughHole).toBe("closed");
  });

  it("<Walkthrough.Target registry> registers with a walkthrough in another root", () => {
    const shared = createWalkthroughRegistry();
    island(<Walkthrough id="layout" registry={shared} steps={STEPS} firstValue="menu" defaultStep={0} animate={false} />);
    island(
      <Walkthrough.Target id="user-menu" registry={shared}>
        <button data-box="10,20,30,40">Menu</button>
      </Walkthrough.Target>,
    );

    expect(scrim()?.dataset.walkthroughHole).toBe("open");
    expect(card()?.querySelector("[data-walkthrough-waiting]")).toBeNull();
  });

  it("useWalkthroughTarget(id, { registry }) and (id, registry) both reach it", () => {
    for (const form of ["options", "bare"] as const) {
      const shared = createWalkthroughRegistry();
      function Menu() {
        const ref = useWalkthroughTarget("user-menu", form === "options" ? { registry: shared } : shared);
        return <div ref={ref} data-box="5,6,7,8" />;
      }
      island(<Walkthrough id="layout" registry={shared} steps={STEPS} firstValue="menu" defaultStep={0} padding={0} animate={false} />);
      island(<Menu />);

      expect(ring()?.getAttribute("x"), form).toBe("6");
      act(() => {
        for (const r of roots) r.unmount();
      });
      roots.length = 0;
      document.body.innerHTML = "";
    }
  });

  it("<WalkthroughTargetsProvider> lets every target in a root register without naming the registry", () => {
    const shared = createWalkthroughRegistry();
    function Menu() {
      return <div ref={useWalkthroughTarget("user-menu")} data-box="5,6,7,8" />;
    }
    island(<Walkthrough id="layout" registry={shared} steps={STEPS} firstValue="menu" defaultStep={0} padding={0} animate={false} />);
    island(
      <WalkthroughTargetsProvider registry={shared}>
        <Menu />
      </WalkthroughTargetsProvider>,
    );

    expect(ring()?.getAttribute("x")).toBe("6");
  });

  it("a target unmounting in its root unregisters from the shared registry", () => {
    const shared = createWalkthroughRegistry();
    island(<Walkthrough id="layout" registry={shared} steps={STEPS} firstValue="menu" defaultStep={0} animate={false} />);
    const menuRoot = island(
      <Walkthrough.Target id="user-menu" registry={shared}>
        <button data-box="10,20,30,40">Menu</button>
      </Walkthrough.Target>,
    );
    expect(scrim()?.dataset.walkthroughHole).toBe("open");

    act(() => menuRoot.unmount());
    roots.splice(roots.indexOf(menuRoot), 1);

    expect(shared.get("user-menu")).toBeUndefined();
    expect(scrim()?.dataset.walkthroughHole).toBe("closed");
  });

  it("targets inside the walkthrough's own tree still register with the shared registry", () => {
    const shared = createWalkthroughRegistry();
    island(
      <Walkthrough id="layout" registry={shared} steps={STEPS} firstValue="menu" defaultStep={0} animate={false}>
        <Walkthrough.Target id="user-menu">
          <button data-box="10,20,30,40">Menu</button>
        </Walkthrough.Target>
      </Walkthrough>,
    );

    expect(shared.get("user-menu")).toBeInstanceOf(HTMLElement);
    expect(scrim()?.dataset.walkthroughHole).toBe("open");
  });
});

describe("a markdown step body", () => {
  const body = "Do **this**:\n\n- one\n- two\n\n<img src=x onerror=\"bad()\"><script>bad()</script>";

  it("renders markdown, sanitised, when the step says bodyFormat: markdown", () => {
    island(
      <Walkthrough id="md" steps={[{ id: "s", title: "S", body, bodyFormat: "markdown" }]} firstValue="s" defaultStep={0} animate={false} />,
    );
    const el = card()!.querySelector("[data-walkthrough-body]")!;
    expect(el.querySelector("strong")?.textContent).toBe("this");
    expect(el.querySelectorAll("li")).toHaveLength(2);
    expect(el.innerHTML).not.toContain("onerror");
    expect(el.innerHTML).not.toContain("<script");
  });

  it("a walkthrough-wide bodyFormat applies to every step, and a step can opt back out", () => {
    island(
      <Walkthrough
        id="md"
        bodyFormat="markdown"
        steps={[
          { id: "a", title: "A", body: "**bold**" },
          { id: "b", title: "B", body: "**literal**", bodyFormat: "text" },
        ]}
        firstValue="b"
        defaultStep={0}
        animate={false}
      />,
    );
    expect(card()!.querySelector("[data-walkthrough-body] strong")?.textContent).toBe("bold");

    act(() => {
      card()!.querySelector<HTMLButtonElement>('[data-walkthrough-action="next"]')!.click();
    });
    const el = card()!.querySelector("[data-walkthrough-body]")!;
    expect(el.querySelector("strong")).toBeNull();
    expect(el.textContent).toBe("**literal**");
  });

  it("a plain string body is still plain text by default", () => {
    island(<Walkthrough id="t" steps={[{ id: "s", title: "S", body: "**not bold** <b>x</b>" }]} firstValue="s" defaultStep={0} animate={false} />);
    const el = card()!.querySelector("[data-walkthrough-body]")!;
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("**not bold** <b>x</b>");
    expect(el.querySelector("b")).toBeNull();
  });
});
