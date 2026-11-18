"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEFAULT_THEME,
  isTheme,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from "@/lib/theme";

const ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
const CHANGE = "kd-theme-change";

/** The theme on <html> (THEME_SCRIPT set it before paint), or the default. */
function current(): Theme {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : DEFAULT_THEME;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    document.documentElement.dataset.theme = isTheme(e.newValue)
      ? e.newValue
      : DEFAULT_THEME;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function choose(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, current, () => DEFAULT_THEME);
  const Icon = ICONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Tema: ${THEME_LABELS[theme]}`}
        className="inline-flex size-control items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <Icon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => {
            if (isTheme(v)) choose(v);
          }}
        >
          {THEMES.map((t) => {
            const ItemIcon = ICONS[t];
            return (
              <DropdownMenuRadioItem key={t} value={t}>
                <ItemIcon aria-hidden="true" />
                {THEME_LABELS[t]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
