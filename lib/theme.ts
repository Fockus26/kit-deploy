/**
 * The dashboard's theme (D023): dark by default, light, or "system" (prefers-color-scheme).
 * The choice lives in localStorage and becomes `data-theme` on <html>, which app/globals.css
 * turns into `color-scheme`. THEME_SCRIPT runs in <head> before the first paint, so a light
 * choice never flashes dark. Shared by the root layout (server) and the switch (browser).
 */

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "kd-theme";

export const THEME_LABELS: Record<Theme, string> = {
  dark: "Oscuro",
  light: "Claro",
  system: "Sistema",
};

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/** Inline, before paint. Storage can throw (private mode, blocked site data): dark stays. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="system"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;
