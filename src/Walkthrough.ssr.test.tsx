// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

/*
 * SSR safety: importing the package and rendering a walkthrough on the server
 * must not touch `window` or `localStorage` -- the default storage adapter is
 * the obvious way to break that.
 */
describe("on the server", () => {
  it("imports and renders with the default storage and a routed step", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const { Walkthrough, createLocalStorageAdapter } = await import("./index");
    const html = renderToString(
      <Walkthrough id="a" steps={[{ id: "s", title: "S", route: "/x" }]} defaultStep={0} onNavigate={() => {}}>
        <p>app</p>
      </Walkthrough>,
    );
    expect(html).toContain("app");
    const adapter = createLocalStorageAdapter();
    expect(adapter.load()).toBeNull();
    expect(() => adapter.save(null)).not.toThrow();
  });

  it("renders an action-required step, with a module-scope controller signalled on the server", async () => {
    const { Walkthrough, createWalkthroughController } = await import("./index");
    const controller = createWalkthroughController();
    controller.signal("project:created");
    controller.fail("project:created", "nope");
    for (const storage of [undefined, null]) {
      const html = renderToString(
        <Walkthrough
          id="a"
          steps={[{ id: "s", title: "S", target: "t", advanceOn: "event", event: "project:created" }]}
          defaultStep={0}
          storage={storage}
          controller={controller}
        >
          <p>app</p>
        </Walkthrough>,
      );
      expect(html).toContain("app");
    }
  });
});
