import { useSyncExternalStore } from "react";
import { TEXT_KEY, THEME_KEY } from "./look-keys";

/**
 * The look of the app, chosen in Ayarlar and remembered on this computer (not on the server: it is about this
 * screen). `system` = follow the device. The page gets it from <html data-theme data-text> before the first paint
 * (look-script.ts), so there is no flash; this module changes it afterwards.
 */
export const THEMES = ["light", "dark", "system"] as const;
export const TEXT_SIZES = ["normal", "large", "xlarge"] as const;
export type Theme = (typeof THEMES)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export interface Look {
  theme: Theme;
  text: TextSize;
}

export { TEXT_KEY, THEME_KEY };
export const DEFAULT_LOOK: Look = { theme: "system", text: "normal" };

export const THEME_LABEL: Readonly<Record<Theme, string>> = {
  light: "Açık",
  dark: "Koyu",
  system: "Cihaz gibi",
};
export const TEXT_LABEL: Readonly<Record<TextSize, string>> = {
  normal: "Normal",
  large: "Büyük",
  xlarge: "Çok büyük",
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
const isText = (v: unknown): v is TextSize =>
  TEXT_SIZES.includes(v as TextSize);

/** What this browser remembers; a blocked or empty store reads as the defaults. */
export function readLook(store: Pick<Storage, "getItem"> | null): Look {
  try {
    const theme = store?.getItem(THEME_KEY);
    const text = store?.getItem(TEXT_KEY);
    return {
      theme: isTheme(theme) ? theme : DEFAULT_LOOK.theme,
      text: isText(text) ? text : DEFAULT_LOOK.text,
    };
  } catch {
    return DEFAULT_LOOK;
  }
}

/** The attributes for <html>: nothing for "system" and "normal" (the CSS defaults). */
export function lookAttributes(look: Look): {
  theme: string | null;
  text: string | null;
} {
  return {
    theme: look.theme === "system" ? null : look.theme,
    text: look.text === "normal" ? null : look.text,
  };
}

function applyToPage(look: Look): void {
  const root = document.documentElement;
  const attrs = lookAttributes(look);
  for (const [name, value] of [
    ["theme", attrs.theme],
    ["text", attrs.text],
  ] as const) {
    if (value === null) delete root.dataset[name];
    else root.dataset[name] = value;
  }
}

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Remember the choice and show it now. A browser that refuses storage still shows it until the page closes. */
export function setLook(next: Partial<Look>): void {
  const store = browserStore();
  const look = { ...readLook(store), ...next };
  try {
    for (const [key, value, base] of [
      [THEME_KEY, look.theme, DEFAULT_LOOK.theme],
      [TEXT_KEY, look.text, DEFAULT_LOOK.text],
    ] as const) {
      if (value === base) store?.removeItem(key);
      else store?.setItem(key, value);
    }
  } catch {
    // Not remembered; the page below still changes.
  }
  applyToPage(look);
  current = look;
  notify();
}

let current: Look | null = null;
const SERVER_LOOK = DEFAULT_LOOK;

function snapshot(): Look {
  current ??= readLook(browserStore());
  return current;
}

/** The look as React state: `[look, setLook]`. */
export function useLook(): readonly [Look, typeof setLook] {
  const look = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    snapshot,
    () => SERVER_LOOK,
  );
  return [look, setLook] as const;
}
