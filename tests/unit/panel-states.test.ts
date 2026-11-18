import { describe, expect, test } from "bun:test";
import { Rocket } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "@/components/kit/empty-state";
import { LogViewer } from "@/components/kit/log-viewer";
import { digestOf } from "@/components/states/digest";
import { StatusScreen } from "@/components/states/status-screen";

const lines = [{ time: "14:02:11", level: "info" as const, text: "listo" }];

describe("EmptyState level", () => {
  test("is an h2 by default and takes the level it is given", () => {
    const at = (level?: 2 | 3 | 4) =>
      renderToStaticMarkup(
        createElement(EmptyState, { icon: Rocket, title: "Vacío", level }),
      );
    expect(at()).toContain("<h2");
    expect(at(3)).toContain("<h3");
    expect(at(4)).toContain("<h4");
  });
});

describe("LogViewer follow", () => {
  const view = (follow: boolean) =>
    renderToStaticMarkup(
      createElement(LogViewer, {
        lines,
        follow,
        following: follow,
        onTogglePause: () => {},
        label: "Logs de x",
      }),
    );
  test("a followed log has its Siguiendo bar and pause button", () => {
    expect(view(true)).toContain("Siguiendo");
    expect(view(true)).toContain("Pausar");
  });
  test("a static search has neither, and its log region is not live", () => {
    const html = view(false);
    expect(html).not.toContain("En pausa");
    expect(html).not.toContain("Reanudar");
    expect(html).not.toContain("Siguiendo");
    expect(html).toContain('aria-live="off"');
    expect(html).toContain("listo");
  });
});

describe("500 and 404 screens", () => {
  test("digestOf reads only a non-empty string digest", () => {
    expect(digestOf(Object.assign(new Error("x"), { digest: "abc123" }))).toBe(
      "abc123",
    );
    expect(digestOf(new Error("x"))).toBeUndefined();
    expect(digestOf({ digest: "" })).toBeUndefined();
    expect(digestOf({ digest: 5 })).toBeUndefined();
    expect(digestOf(null)).toBeUndefined();
    expect(digestOf("boom")).toBeUndefined();
  });
  test("a status screen has one h1 with the code above it", () => {
    const html = renderToStaticMarkup(
      createElement(StatusScreen, {
        code: "404",
        title: "Esta página no existe",
        actions: null,
        // biome-ignore lint/correctness/noChildrenProp: the typed props require it here
        children: "Texto",
      }),
    );
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html.indexOf("404")).toBeLessThan(html.indexOf("<h1"));
  });
});
