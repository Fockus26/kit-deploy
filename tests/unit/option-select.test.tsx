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
  test("the value travels in its own hidden input under the name, also server-side (D064)", () => {
    const html = render("error");
    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="level"[^>]*value="error"/,
    );
    // Radix's native select is not named: the browser's form reset rewinds it, so it must not
    // be what the form submits.
    const select = html.match(/<select[^>]*>/)?.[0] ?? "";
    expect(select).not.toContain("name=");
  });

  test("without a name there is nothing to submit", () => {
    const html = renderToStaticMarkup(
      <OptionSelect defaultValue="error" options={OPTIONS} />,
    );
    expect(html).not.toContain('type="hidden"');
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
