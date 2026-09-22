import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Portal } from "@particle-academy/react-fancy";

import { cutoutPath, pad, sameRect, visibleRect, type Rect, type Viewport } from "./geometry";

export interface SpotlightProps {
  /** The element to spotlight. `null` = a solid scrim (a centred step). */
  target: HTMLElement | null;
  /** Space between the target and the edge of the hole. Default 6. */
  padding?: number;
  /** Corner radius of the hole. Default 10. */
  radius?: number;
  /** Clicking the scrim (not the hole). The hole itself passes clicks through. */
  onScrimClick?: () => void;
  /** Reports the hole as drawn -- what a step card anchors to. */
  onHoleChange?: (hole: Rect | null) => void;
  /** Glide between targets. Off under `prefers-reduced-motion` regardless. Default true. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

const GLIDE_MS = 280;

function viewportNow(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function lerp(a: Rect, b: Rect, t: number): Rect {
  const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
  return {
    top: a.top + (b.top - a.top) * e,
    left: a.left + (b.left - a.left) * e,
    width: a.width + (b.width - a.width) * e,
    height: a.height + (b.height - a.height) * e,
  };
}

/**
 * The scrim with a hole where the target is VISIBLE.
 *
 * Measured live, not once: on scroll in ANY container (a capture-phase
 * listener on the window sees every scroll event, including a panel's), on
 * resize, and when the target itself changes size. The hole is the target's
 * box clipped by every clipping ancestor -- see `visibleRect` -- so a target
 * inside a scrolled panel is never spotlighted past the panel's edge.
 *
 * A target that exists but is not visible at all is scrolled into view once,
 * rather than drawn as a zero-sized hole or a hole over the wrong thing.
 *
 * Clicks inside the hole reach the real target: the SVG ignores pointer events
 * and only the scrim PATH takes them, and the path excludes the hole. That is
 * what lets a step advance on the person actually clicking the thing.
 *
 * Styling is two CSS variables, so a theme restyles it without a selector
 * fight: `--fw-scrim` (the dimmed area) and `--fw-ring` (the hole's outline).
 */
export function Spotlight({
  target,
  padding = 6,
  radius = 10,
  onScrimClick,
  onHoleChange,
  animate = true,
  className,
  style,
}: SpotlightProps) {
  const [viewport, setViewport] = useState<Viewport>(() =>
    typeof window === "undefined" ? { width: 0, height: 0 } : viewportNow(),
  );
  const [hole, setHole] = useState<Rect | null>(null);

  const measured = useRef<Rect | null>(null);
  const drawn = useRef<Rect | null>(null);
  const lastTarget = useRef<HTMLElement | null>(null);
  const scrolledFor = useRef<HTMLElement | null>(null);
  const glide = useRef<number | null>(null);
  const onHoleChangeRef = useRef(onHoleChange);
  onHoleChangeRef.current = onHoleChange;

  useLayoutEffect(() => {
    let frame: number | null = null;

    const draw = (next: Rect | null) => {
      if (sameRect(drawn.current, next)) return;
      drawn.current = next;
      setHole(next);
      onHoleChangeRef.current?.(next);
    };

    const measure = () => {
      frame = null;
      const view = viewportNow();
      setViewport((prev) => (prev.width === view.width && prev.height === view.height ? prev : view));

      const bounds: Rect = { top: 0, left: 0, width: view.width, height: view.height };
      const visible = target ? visibleRect(target, view) : null;
      const next = visible ? pad(visible, padding, bounds) : null;

      if (target && visible === null && scrolledFor.current !== target && typeof target.scrollIntoView === "function") {
        // Once per target: a person who then scrolls away on purpose is not
        // yanked back every frame.
        scrolledFor.current = target;
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }

      const targetChanged = lastTarget.current !== target;
      lastTarget.current = target;
      const from = drawn.current;
      measured.current = next;

      // Glide only when the TARGET changed. A hole that trails a scrolling
      // page by 280ms reads as lag, not polish -- scroll and resize snap.
      if (targetChanged && animate && !prefersReducedMotion() && from && next && typeof requestAnimationFrame === "function") {
        if (glide.current !== null) cancelAnimationFrame(glide.current);
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / GLIDE_MS);
          // Glide toward the LATEST measurement, so a scroll mid-glide lands
          // where the target is now rather than where it was.
          const to = measured.current;
          if (!to) {
            glide.current = null;
            draw(null);
            return;
          }
          draw(lerp(from, to, t));
          glide.current = t < 1 ? requestAnimationFrame(step) : null;
        };
        glide.current = requestAnimationFrame(step);
        return;
      }

      if (glide.current === null) draw(next);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(measure) : (setTimeout(measure, 16) as unknown as number);
    };

    // A resize can push the target off-screen without the person doing
    // anything. Unlike a scroll -- which may be them looking elsewhere on
    // purpose -- that is no reason to leave them facing a card that points at
    // nothing, so it re-arms the scroll-into-view.
    const onResize = () => {
      scrolledFor.current = null;
      schedule();
    };

    measure();

    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver === "function" && target ? new ResizeObserver(schedule) : null;
    if (observer && target) observer.observe(target);

    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [target, padding, animate]);

  useEffect(
    () => () => {
      if (glide.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(glide.current);
    },
    [],
  );

  const d = cutoutPath(viewport, hole, radius);

  return (
    <Portal>
      <div
        data-walkthrough-scrim=""
        data-walkthrough-hole={hole ? "open" : "closed"}
        className={className}
        style={{ position: "fixed", inset: 0, zIndex: 2147483000, pointerEvents: "none", ...style }}
      >
        <svg
          width={viewport.width}
          height={viewport.height}
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
          aria-hidden="true"
        >
          <path
            d={d}
            fillRule="evenodd"
            style={{ fill: "var(--fw-scrim, rgb(9 9 11 / 0.55))", pointerEvents: "auto", cursor: onScrimClick ? "pointer" : "default" }}
            onClick={onScrimClick}
          />
          {hole && (
            <rect
              data-walkthrough-ring=""
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx={Math.min(radius, hole.width / 2, hole.height / 2)}
              style={{
                fill: "none",
                stroke: "var(--fw-ring, rgb(255 255 255 / 0.9))",
                strokeWidth: 2,
                filter: "drop-shadow(0 0 10px var(--fw-ring-glow, rgb(99 102 241 / 0.65)))",
                pointerEvents: "none",
              }}
            />
          )}
        </svg>
      </div>
    </Portal>
  );
}
