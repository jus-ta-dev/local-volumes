// Extend the audio-device menu with a shortcut to the mixer.
export function installAudioMenu(
  open: () => void,
  shortcutText: () => string,
): () => void {
  const style = document.createElement("style");
  style.textContent = `#local-volumes-audio-menu{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;text-align:left;font:inherit;line-height:20px;color:var(--interactive-normal,var(--text-normal,#ddd));background:transparent;border:0;border-radius:4px;padding:8px;cursor:pointer}#local-volumes-audio-menu:hover,#local-volumes-audio-menu:focus-visible{background:var(--background-modifier-hover,#393940);color:var(--interactive-active,#fff)}#local-volumes-audio-menu:focus-visible{outline:2px solid var(--focus-primary,#00a8fc);outline-offset:-2px}#local-volumes-audio-menu .lv-menu-shortcut{margin-left:auto;font-size:11px;color:var(--text-muted,#aaa);white-space:nowrap}`;
  document.head.append(style);
  let entry: HTMLButtonElement | undefined;
  let removeKeys: (() => void) | undefined;
  let frame = 0;
  function attach() {
    if (entry?.isConnected) return;
    removeKeys?.();
    removeKeys = undefined;
    const menu = document.querySelector<HTMLElement>(
      '[aria-label="Audio Device Actions"]',
    );
    if (!menu) return;
    entry = document.createElement("button");
    entry.type = "button";
    entry.role = "menuitem";
    entry.id = "local-volumes-audio-menu";
    entry.setAttribute("aria-label", "Local Volumes");
    const label = document.createElement("span");
    label.textContent = "Local Volumes";
    const shortcut = document.createElement("span");
    shortcut.className = "lv-menu-shortcut";
    shortcut.textContent = shortcutText();
    shortcut.setAttribute("aria-hidden", "true");
    entry.append(label, shortcut);
    entry.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Use the existing menu's Escape handling, then open after it unmounts.
      menu.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
      // Discord restores focus to the audio trigger as its menu closes.
      // Wait through that frame so it cannot pull focus out of the mixer.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(open);
      });
    };
    const button = entry;
    function keys(event: KeyboardEvent) {
      if (!(event.target instanceof Node) || !menu!.contains(event.target))
        return;
      const items = Array.from(
        menu!.querySelectorAll<HTMLElement>(
          '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]',
        ),
      ).filter(
        (item) =>
          item !== button && item.getAttribute("aria-disabled") !== "true",
      );
      const active = document.activeElement;
      if (active === button) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          button.click();
          return;
        }
        const target =
          event.key === "ArrowUp" || event.key === "End"
            ? items.at(-1)
            : event.key === "ArrowDown" || event.key === "Home"
              ? items[0]
              : undefined;
        if (target) {
          event.preventDefault();
          event.stopPropagation();
          target.focus();
        }
      } else if (
        (event.key === "ArrowDown" && active === items.at(-1)) ||
        (event.key === "ArrowUp" && active === items[0]) ||
        (event.key === "End" &&
          (active === menu || items.includes(active as HTMLElement)))
      ) {
        event.preventDefault();
        event.stopPropagation();
        button.focus();
      }
    }
    // Capture before Discord's delegated React handler skips our local item.
    document.addEventListener("keydown", keys, true);
    removeKeys = () => document.removeEventListener("keydown", keys, true);
    // Place inside the existing item container rather than outside its scroller.
    const last = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).at(-1);
    (last?.parentElement ?? menu).append(entry);
  }
  const observer = new MutationObserver(attach);
  observer.observe(document.body, { childList: true, subtree: true });
  attach();
  return () => {
    observer.disconnect();
    removeKeys?.();
    cancelAnimationFrame(frame);
    entry?.remove();
    style.remove();
  };
}
