/**
 * Select-after-rejected-submit guard (D064): a select inside a `<form action={…}>` must keep the
 * chosen value after the server refuses the submit, and the next submit must carry what it shows.
 * React runs `form.reset()` when a form action settles; Radix Select listens to that reset and
 * used to snap back to its first value (Nuevo proyecto saved 512 MB, a token went to another
 * project). Every submit here is refused on purpose, so the guard writes nothing.
 *
 *   node scripts/qa/select-after-rejected-submit.mjs [baseUrl]   (default http://localhost:4301)
 * Needs .qa/session.json and the demo projects (bun scripts/qa-session.ts --port <port> --demo),
 * against qa:local (`--preview` for the production build). Run with node, not Bun.
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:4301").replace(/\/$/, "");
const LONG = 10 * 60_000;
const fails = [];

const isAction = (req) =>
  req.method() === "POST" && !!req.headers()["next-action"];

/** The value of `field` in a Server Action's multipart body (React prefixes it with "_<n>_"). */
function fieldOf(body, field) {
  const m = new RegExp(
    `name="(?:_?\\d+_)?${field}"\\r?\\n\\r?\\n([^\\r\\n]*)`,
  ).exec(body ?? "");
  return m ? m[1] : null;
}

/** Clicks submit, waits for the action's response and returns the value sent for `field`. */
async function submit(page, button, field) {
  const [req] = await Promise.all([
    page.waitForRequest(isAction, { timeout: LONG }),
    button.click(),
  ]);
  await (await req.response())?.finished();
  await page.waitForTimeout(500); // the form reset and the re-render after the action
  return fieldOf(req.postData(), field);
}

/** Two refused submits in a row: what the select shows and sends after the first one. */
async function check(
  what,
  page,
  { combo, option, value, keep, button, field },
) {
  await combo.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  const first = await submit(page, button, field);
  if (first !== value)
    fails.push(`${what}: first submit sent ${first} (chosen ${value})`);
  const shown = (await combo.innerText()).trim();
  if (shown !== option)
    fails.push(
      `${what}: shows "${shown}" after the refusal (chosen "${option}")`,
    );
  for (const [locator, expected] of keep) {
    const v = await locator.inputValue();
    if (v !== expected)
      fails.push(
        `${what}: ${await locator.getAttribute("name")} lost its value`,
      );
  }
  const second = await submit(page, button, field);
  if (second !== value)
    fails.push(`${what}: next submit sent ${second} (chosen ${value})`);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ storageState: ".qa/session.json" });

  // Nuevo proyecto › Memoria — the name with capitals is refused by the server.
  const np = await ctx.newPage();
  np.setDefaultTimeout(LONG);
  await np.goto(`${base}/new`, { waitUntil: "load", timeout: LONG });
  const name = np.locator("input[name=name]");
  await name.fill("Mayusculas");
  const repo = np.locator("input[name=repo]:not([type=hidden])");
  if (await repo.count()) await repo.fill("qa/select-guard");
  await check("Nuevo proyecto", np, {
    combo: np.getByRole("combobox", { name: "Memoria" }),
    option: "1024 MB",
    value: "1024",
    keep: [[name, "Mayusculas"]],
    button: np.getByRole("button", { name: "Crear proyecto" }),
    field: "memoryMb",
  });

  // Ajustes › Nuevo token › Proyecto — a label over 100 characters is refused by the server.
  const st = await ctx.newPage();
  st.setDefaultTimeout(LONG);
  await st.goto(`${base}/settings`, { waitUntil: "load", timeout: LONG });
  const form = st.getByRole("form", { name: "Nuevo token" });
  const combo = form.getByRole("combobox", { name: "Proyecto" });
  await combo.click();
  const options = (await st.getByRole("option").allInnerTexts()).map((o) =>
    o.trim(),
  );
  await st.keyboard.press("Escape");
  const label = form.locator("input[name=label]");
  await label.evaluate((el) => el.removeAttribute("maxlength"));
  const long = "z".repeat(101);
  await label.fill(long);
  if (options.length < 2) {
    fails.push(
      "Nuevo token: needs two projects or more (qa-session.ts --demo)",
    );
  } else {
    const last = options[options.length - 1]; // never the first: that is what a reset brings back
    await check("Nuevo token", st, {
      combo,
      option: last,
      value: last,
      keep: [[label, long]],
      button: form.getByRole("button", { name: "Crear token" }),
      field: "project",
    });
  }
} finally {
  await browser.close();
}

console.log(
  fails.length
    ? `FAIL ${fails.join("; ")}`
    : "PASS select-after-rejected-submit",
);
process.exit(fails.length ? 1 : 0);
