// Primary means Command on macOS and Control on Windows/Linux.
export interface Shortcut {
  code: string;
  primary: boolean;
  alt: boolean;
  shift: boolean;
}
export const defaultShortcut = (): Shortcut => ({
  code: "KeyL",
  primary: true,
  alt: false,
  shift: true,
});
type Key = {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  getModifierState?: (key: string) => boolean;
};
export function validateShortcut(value: unknown): Shortcut {
  const s = value as Shortcut;
  if (
    !s ||
    !/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(s.code) ||
    s.primary !== true ||
    typeof s.alt !== "boolean" ||
    typeof s.shift !== "boolean"
  )
    throw new Error("Use Command / Ctrl with a letter, number or F1–F12.");
  return { code: s.code, primary: true, alt: s.alt, shift: s.shift };
}
export function recordShortcut(e: Key, mac: boolean): Shortcut | undefined {
  if (
    e.repeat ||
    e.isComposing ||
    e.getModifierState?.("AltGraph") ||
    (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey)
  )
    return;
  try {
    return validateShortcut({
      code: e.code,
      primary: true,
      alt: e.altKey,
      shift: e.shiftKey,
    });
  } catch {
    return;
  }
}
export function matchesShortcut(e: Key, s: Shortcut, mac: boolean): boolean {
  const candidate = recordShortcut(e, mac);
  return Boolean(
    candidate &&
      candidate.code === s.code &&
      candidate.alt === s.alt &&
      candidate.shift === s.shift,
  );
}
export function shortcutLabel(s: Shortcut, mac: boolean): string {
  const key = s.code.replace(/^(Key|Digit)/, "");
  return mac
    ? `⌘${s.alt ? "⌥" : ""}${s.shift ? "⇧" : ""}${key}`
    : `Ctrl+${s.alt ? "Alt+" : ""}${s.shift ? "Shift+" : ""}${key}`;
}
