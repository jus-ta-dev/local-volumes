// Extend the existing user menu with a local group-membership action.
export function installContextMenu(
  people: () => { id: string }[],
  open: (id: string) => void,
): () => void {
  let selected: string | undefined;
  let expires = 0;
  let entry: HTMLButtonElement | undefined;
  let removeKeys: (() => void) | undefined;
  let frame = 0;
  const style = document.createElement("style");
  style.textContent = `#local-volumes-user-menu{display:block;box-sizing:border-box;width:100%;min-height:32px;text-align:left;font:inherit;font-size:14px;line-height:20px;color:var(--interactive-normal,var(--text-default,var(--text-normal,#ddd)));background:transparent;border:0;border-radius:4px;padding:6px 8px;cursor:pointer;white-space:nowrap}#local-volumes-user-menu:hover,#local-volumes-user-menu:focus-visible{background:var(--background-modifier-hover,#393940);color:var(--interactive-active,#fff)}#local-volumes-user-menu:focus-visible{outline:2px solid var(--focus-primary,#00a8fc);outline-offset:-2px}`;
  document.head.append(style);
  function capture(event: MouseEvent) {
    selected = undefined;
    entry?.remove();
    entry = undefined;
    removeKeys?.();
    removeKeys = undefined;
    cancelAnimationFrame(frame);
    const current = new Set(people().map((p) => p.id));
    if (!current.size || !(event.target instanceof Element)) return;
    // Read only user identity props, bounded to the clicked component's ancestry.
    for (
      let element: Element | null = event.target, depth = 0;
      element && depth < 5;
      element = element.parentElement, depth++
    ) {
      const key = Object.keys(element).find((k) =>
        k.startsWith("__reactFiber$"),
      );
      if (!key) continue;
      let fiber = (element as any)[key];
      for (let i = 0; fiber && i < 12; i++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        const id = props?.user?.id ?? props?.userId;
        if (typeof id === "string" && current.has(id)) {
          selected = id;
          expires = Date.now() + 1500;
          return;
        }
      }
    }
  }
  document.addEventListener("contextmenu", capture, true);
  const observer = new MutationObserver(() => {
    if (entry && !entry.isConnected) {
      removeKeys?.();
      removeKeys = undefined;
    }
    if (!selected || Date.now() > expires || entry?.isConnected) return;
    const menu = document.querySelector<HTMLElement>(
      '[role="menu"][id="user-context"]',
    );
    if (!menu) return;
    // The menu root is a horizontal flex container. Join the existing item
    // stack inside its scroller, or skip unsupported markup entirely.
    const last = Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]',
      ),
    )
      .filter((item) => item.closest('[role="menu"]') === menu)
      .at(-1);
    const container = last?.parentElement;
    if (!container || container === menu) return;
    const id = selected;
    entry = document.createElement("button");
    entry.type = "button";
    entry.role = "menuitem";
    entry.textContent = "Local Volumes…";
    entry.id = "local-volumes-user-menu";
    const activate = () => {
      selected = undefined;
      // Let the existing menu process its normal Escape close before opening ours.
      menu.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => open(id));
      });
    };
    entry.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate();
    };
    const button = entry;
    const keys = (event: KeyboardEvent) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target))
        return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>(
          '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]',
        ),
      ).filter(
        (item) =>
          item !== button &&
          item.closest('[role="menu"]') === menu &&
          item.getAttribute("aria-disabled") !== "true",
      );
      const active = document.activeElement;
      if (active === button) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          activate();
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
    };
    document.addEventListener("keydown", keys, true);
    removeKeys = () => document.removeEventListener("keydown", keys, true);
    container.append(entry);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    document.removeEventListener("contextmenu", capture, true);
    removeKeys?.();
    cancelAnimationFrame(frame);
    entry?.remove();
    style.remove();
  };
}
