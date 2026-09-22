import { afterEach, describe, expect, it } from "vitest";

import { clipsDescendants, cutoutPath, intersect, pad, sameRect, visibleRect, type Rect } from "./geometry";

const VIEW = { width: 1000, height: 800 };

/** Give an element a box, since jsdom lays nothing out. */
function place(el: Element, rect: Rect): void {
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON: () => rect,
    }) as DOMRect;
}

function el(style: Partial<CSSStyleDeclaration> = {}, parent: Element = document.body): HTMLElement {
  const node = document.createElement("div");
  Object.assign(node.style, style);
  parent.appendChild(node);
  return node;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("intersect", () => {
  it("returns the overlap", () => {
    expect(intersect({ top: 0, left: 0, width: 100, height: 100 }, { top: 50, left: 25, width: 100, height: 100 })).toEqual({
      top: 50,
      left: 25,
      width: 75,
      height: 50,
    });
  });

  it("is null when rects only touch, rather than a zero-sized overlap", () => {
    // A zero-width hole is still a hole to an SVG path, and spotlighting
    // nothing looks exactly like a broken walkthrough.
    expect(intersect({ top: 0, left: 0, width: 10, height: 10 }, { top: 0, left: 10, width: 10, height: 10 })).toBeNull();
  });
});

describe("clipsDescendants", () => {
  it.each(["hidden", "clip", "auto", "scroll", "overlay"])("%s clips", (value) => {
    expect(clipsDescendants({ overflow: value, overflowX: "", overflowY: "" })).toBe(true);
  });

  it("visible does not", () => {
    expect(clipsDescendants({ overflow: "visible", overflowX: "visible", overflowY: "visible" })).toBe(false);
  });

  it("one clipping axis is enough", () => {
    expect(clipsDescendants({ overflow: "", overflowX: "visible", overflowY: "auto" })).toBe(true);
  });
});

describe("visibleRect", () => {
  it("is the target's box when nothing clips it", () => {
    const target = el();
    place(target, { top: 100, left: 100, width: 50, height: 20 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 100, left: 100, width: 50, height: 20 });
  });

  it("is clipped by an overflow:hidden ancestor -- the case every tour library gets wrong", () => {
    // A 300px panel whose content has scrolled: the target's box runs 40px
    // past the panel's bottom edge. The hole must stop at the edge, or it
    // spotlights the panel border and the page behind it.
    const panel = el({ overflow: "hidden" });
    place(panel, { top: 100, left: 100, width: 300, height: 300 });
    const target = el({}, panel);
    place(target, { top: 360, left: 120, width: 100, height: 80 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 360, left: 120, width: 100, height: 40 });
  });

  it("is null when the target has scrolled out of its panel entirely", () => {
    const panel = el({ overflowY: "auto" });
    place(panel, { top: 100, left: 100, width: 300, height: 300 });
    const target = el({}, panel);
    place(target, { top: 500, left: 120, width: 100, height: 40 });

    expect(visibleRect(target, VIEW)).toBeNull();
  });

  it("is clipped by the viewport", () => {
    const target = el();
    place(target, { top: 780, left: 10, width: 50, height: 50 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 780, left: 10, width: 50, height: 20 });
  });

  it("is null when the target is below the fold", () => {
    const target = el();
    place(target, { top: 900, left: 10, width: 50, height: 50 });

    expect(visibleRect(target, VIEW)).toBeNull();
  });

  it("intersects every clipping ancestor, not just the nearest", () => {
    const outer = el({ overflow: "hidden" });
    place(outer, { top: 0, left: 0, width: 200, height: 800 });
    const inner = el({ overflow: "hidden" }, outer);
    place(inner, { top: 100, left: 0, width: 1000, height: 100 });
    const target = el({}, inner);
    place(target, { top: 150, left: 150, width: 200, height: 200 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 150, left: 150, width: 50, height: 50 });
  });

  it("ignores ancestors that do not clip", () => {
    const wrapper = el({ overflow: "visible" });
    place(wrapper, { top: 0, left: 0, width: 10, height: 10 });
    const target = el({}, wrapper);
    place(target, { top: 100, left: 100, width: 50, height: 50 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 100, left: 100, width: 50, height: 50 });
  });

  it("stops at a position:fixed ancestor, which escapes the clipping above it", () => {
    const clipper = el({ overflow: "hidden" });
    place(clipper, { top: 0, left: 0, width: 10, height: 10 });
    const fixed = el({ position: "fixed" }, clipper);
    place(fixed, { top: 0, left: 0, width: 1000, height: 800 });
    const target = el({}, fixed);
    place(target, { top: 100, left: 100, width: 50, height: 50 });

    expect(visibleRect(target, VIEW)).toEqual({ top: 100, left: 100, width: 50, height: 50 });
  });
});

describe("pad", () => {
  it("grows a rect on every side", () => {
    expect(pad({ top: 10, left: 10, width: 20, height: 20 }, 4)).toEqual({ top: 6, left: 6, width: 28, height: 28 });
  });

  it("stays inside its bounds", () => {
    const bounds = { top: 0, left: 0, width: 100, height: 100 };
    expect(pad({ top: 0, left: 0, width: 20, height: 20 }, 4, bounds)).toEqual({ top: 0, left: 0, width: 24, height: 24 });
  });
});

describe("cutoutPath", () => {
  it("is a solid scrim with no hole", () => {
    expect(cutoutPath(VIEW, null)).toBe("M0 0H1000V800H0Z");
  });

  it("cuts a rounded hole as a second subpath", () => {
    const path = cutoutPath(VIEW, { top: 100, left: 200, width: 60, height: 40 }, 8);

    expect(path.startsWith("M0 0H1000V800H0Z")).toBe(true);
    expect(path).toContain("M208 100");
    expect(path).toContain("A8 8 0 0 1 260 108");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("never lets the radius exceed half the hole", () => {
    // An oversized radius on a small target draws arcs that cross each other.
    const path = cutoutPath(VIEW, { top: 0, left: 0, width: 10, height: 6 }, 50);
    expect(path).toContain("A3 3");
  });
});

describe("sameRect", () => {
  it("treats sub-pixel jitter as the same rect", () => {
    expect(sameRect({ top: 1, left: 1, width: 1, height: 1 }, { top: 1.2, left: 1, width: 1, height: 1 })).toBe(true);
  });

  it("treats null and a rect as different", () => {
    expect(sameRect(null, { top: 0, left: 0, width: 1, height: 1 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
  });
});
