/**
 * Where a target actually is on screen, and the hole the scrim cuts for it.
 *
 * This file is the reason the package exists. Every tour library measures the
 * target's bounding box and draws a hole there, which is right until the target
 * sits inside a scrolling panel: the box then extends past the panel's edge,
 * the hole spotlights the panel's border and the page behind it, and the user
 * is told to click something they cannot see. The fix is to measure what is
 * VISIBLE -- the target's box clipped by every ancestor that clips -- and to
 * treat "nothing is visible" as a state, not as a zero-sized hole.
 *
 * Pure functions over rects and computed styles, so they are tested without a
 * layout engine (jsdom has none) by stubbing the two things they read.
 */

/** A rectangle in viewport (client) coordinates. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Width and height of the viewport the scrim covers. */
export interface Viewport {
  width: number;
  height: number;
}

/** The overflow values that clip descendants. `visible` is the only one that does not. */
const CLIPPING = new Set(["hidden", "clip", "auto", "scroll", "overlay"]);

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** The overlap of two rects, or `null` when they do not overlap at all. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Whether an element with this computed style clips its descendants. */
export function clipsDescendants(style: Pick<CSSStyleDeclaration, "overflow" | "overflowX" | "overflowY">): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some((value) =>
    (value ?? "")
      .split(/\s+/)
      .some((part) => CLIPPING.has(part)),
  );
}

/**
 * The part of `el` a person can actually see: its box, clipped by every
 * clipping ancestor and by the viewport.
 *
 * `null` means none of it is visible -- scrolled out of its panel, or out of
 * the window. That is different from "not mounted", and the walkthrough treats
 * it differently: it scrolls the target into view rather than waiting for it.
 *
 * The walk stops at a `position: fixed` element, because a fixed element is
 * positioned against the viewport and escapes its ancestors' clipping. (A
 * transformed ancestor would re-capture it; that case is rare enough in a UI a
 * walkthrough points at that it is left to the viewport clip.)
 */
export function visibleRect(el: Element, viewport: Viewport): Rect | null {
  const view: Rect = { top: 0, left: 0, width: viewport.width, height: viewport.height };
  let visible = intersect(rectOf(el), view);
  if (visible === null) return null;

  const win = el.ownerDocument.defaultView;
  if (win === null) return visible;

  let node: Element = el;
  if (win.getComputedStyle(node).position === "fixed") return visible;

  let parent = node.parentElement;
  while (parent !== null && parent !== el.ownerDocument.documentElement) {
    const style = win.getComputedStyle(parent);
    if (clipsDescendants(style)) {
      visible = intersect(visible, rectOf(parent));
      if (visible === null) return null;
    }
    if (style.position === "fixed") break;
    node = parent;
    parent = node.parentElement;
  }

  return visible;
}

/** Grow a rect by `padding` on every side, then keep it inside `bounds`. */
export function pad(rect: Rect, padding: number, bounds?: Rect): Rect {
  const grown: Rect = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
  return bounds ? (intersect(grown, bounds) ?? grown) : grown;
}

/**
 * The scrim as one SVG path: the whole viewport, with the hole cut out.
 *
 * Drawn with `fill-rule="evenodd"`, so the inner rounded rect subtracts from
 * the outer one. One path rather than a mask: masks need an id that is unique
 * per document, and two walkthroughs on one page is a real case (a nested
 * panel's own hint).
 *
 * With no hole the scrim is solid -- a centred step, or a target that is not
 * visible yet. The caller decides which; this function only draws.
 */
export function cutoutPath(viewport: Viewport, hole: Rect | null, radius = 8): string {
  const outer = `M0 0H${fmt(viewport.width)}V${fmt(viewport.height)}H0Z`;
  if (hole === null) return outer;

  const r = Math.max(0, Math.min(radius, hole.width / 2, hole.height / 2));
  const x = hole.left;
  const y = hole.top;
  const w = hole.width;
  const h = hole.height;

  const inner =
    `M${fmt(x + r)} ${fmt(y)}` +
    `H${fmt(x + w - r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + w)} ${fmt(y + r)}` +
    `V${fmt(y + h - r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + w - r)} ${fmt(y + h)}` +
    `H${fmt(x + r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x)} ${fmt(y + h - r)}` +
    `V${fmt(y + r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + r)} ${fmt(y)}Z`;

  return outer + inner;
}

/** Two rects equal to the sub-pixel, so a steady page does not re-render every frame. */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function fmt(n: number): string {
  // Two decimals is below a device pixel and keeps the path string stable.
  return String(Math.round(n * 100) / 100);
}
