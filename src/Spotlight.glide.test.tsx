// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Spotlight } from "./Spotlight";
import type { Rect } from "./geometry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Moving the spotlight from one target to ANOTHER, with the glide on.
 *
 * Found on the showcase: every step after the first kept the hole on the first
 * step's target. `animate={false}` moved it correctly, which is what localised
 * it to the glide path — the branch that `return`s before the unconditional
 * `draw(next)`.
 *
 * The transition that was never covered is element -> element. null -> element
 * works because `from` is null, so the glide branch is skipped entirely and the
 * hole is drawn directly; and the package's own demo only ever moved between
 * targets that needed a SCROLL, which fires `schedule()` and re-measures. Both
 * hid this.
 */
function rect(x: number, w: number): Rect {
  return { top: 10, left: x, width: w, height: 30 };
}

function stub(el: HTMLElement, x: number, w: number) {
  el.getBoundingClientRect = () =>
    ({ x, y: 10, left: x, top: 10, width: w, height: 30, right: x + w, bottom: 40, toJSON: () => {} }) as DOMRect;
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("Spotlight glide", () => {
  it("moves the hole when the target changes from one element to another", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.append(a, b);
    stub(a, 100, 50);
    stub(b, 600, 50);

    const holes: (Rect | null)[] = [];
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root!.render(<Spotlight target={a} onHoleChange={(h) => holes.push(h)} />));
    act(() => root!.render(<Spotlight target={b} onHoleChange={(h) => holes.push(h)} />));

    // Let the glide run to completion.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });

    const last = holes[holes.length - 1];
    expect(last, "the hole never reached the second target").not.toBeNull();
    // 600 - 6 padding.
    expect(Math.round(last!.left)).toBe(594);
  });
});
