import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "../../components/kit/field";
import { OptionSelect } from "../../components/kit/option-select";
import { LEVEL_ALL, parseLogFilter } from "../../lib/kit/logs-page";

const OPTIONS = [
  { value: LEVEL_ALL, label: "Todos los niveles" },
  { value: "error", label: "Error" },
];

const render = (defaultValue: string) =>
  renderToStaticMarkup(
    <form method="get">
      <Field label="Nivel">
        {(a11y) => (
          <OptionSelect
            name="level"
            defaultValue={defaultValue}
            options={OPTIONS}
            {...a11y}
          />
        )}
      </Field>
    </form>,
  );

describe("OptionSelect", () => {
  test("renders a hidden native select with the name, so a form submits it", () => {
    const html = render("error");
    const select = html.match(/<select[^>]*>/)?.[0] ?? "";
    expect(select).toContain('name="level"');
    expect(select).toContain('aria-hidden="true"');
  });

  test("the label names the trigger (id lands on the combobox button)", () => {
    const html = render("error");
    const label = html.match(/<label[^>]*for="([^"]+)"/);
    expect(label).not.toBeNull();
    const trigger = html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0] ?? "";
    expect(trigger).toContain(`id="${label?.[1]}"`);
  });

  test("shows the selected option's label in the trigger, also server-side", () => {
    const html = render(LEVEL_ALL);
    expect(html).toMatch(/select-value[^>]*>Todos los niveles</);
    expect(render("error")).toMatch(/select-value[^>]*>Error</);
  });
});

describe("level sentinel", () => {
  test("the 'all' value reads as no level filter", () => {
    const f = parseLogFilter(
      { level: LEVEL_ALL },
      [{ env: "production" }],
      ["2026-11-17"],
    );
    expect(f.level).toBeUndefined();
  });

  test("a real level still filters", () => {
    const f = parseLogFilter(
      { level: "error" },
      [{ env: "production" }],
      ["2026-11-17"],
    );
    expect(f.level).toBe("error");
  });
});
