import { styles } from "./styles.ts";
import { type Group } from "../core/config.ts";
import type { Participant } from "../discord/discovery.ts";
import type { UserProfile } from "../discord/profile.ts";
import { mergeEditedMembers } from "../core/joiners.ts";
import {
  matchesShortcut,
  recordShortcut,
  shortcutLabel,
  type Shortcut,
} from "../core/shortcut.ts";

export interface ViewModel {
  shortcut(): Shortcut;
  setShortcut(value: Shortcut | undefined): void;
  groups(): Group[];
  people(): Participant[];
  profile(id: string): UserProfile;
  connected(): boolean;
  editable(): boolean;
  paused(): boolean;
  error(): string;
  saveStatus(): string;
  change(groups: Group[]): void;
  pause(): void;
  retry(): void;
}
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const btn = (text: string, action: () => void, className = "") => {
  const b = el("button", className, text);
  b.type = "button";
  b.onclick = action;
  return b;
};

function avatar(profile: UserProfile): HTMLElement {
  const icon = el("span", "avatar");
  icon.setAttribute("aria-hidden", "true");
  const initials = el(
    "span",
    "",
    Array.from(profile.name).slice(0, 2).join("").toUpperCase(),
  );
  icon.append(initials);
  if (profile.avatarUrl) {
    const image = el("img");
    image.alt = "";
    image.width = 32;
    image.height = 32;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      initials.hidden = true;
    };
    image.onerror = () => {
      image.remove();
      initials.hidden = false;
    };
    image.src = profile.avatarUrl;
    icon.append(image);
  }
  return icon;
}

export function mountMixer(model: ViewModel) {
  const host = el("div");
  host.id = "local-volumes-root";
  // Keep inputs in the document tree: Discord's type-to-chat handler checks
  // document.activeElement and cannot recognize inputs behind a shadow root.
  const root = host;
  const sheet = el("style");
  sheet.textContent = styles;
  const isMac = /Mac/.test(navigator.platform);
  const shortcut = () => shortcutLabel(model.shortcut(), isMac);
  const panel = el("section", "panel");
  panel.popover = "auto";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Local Volumes");
  panel.tabIndex = -1;
  // Keep local typing and Tab navigation out of Discord's document shortcuts.
  // Default input editing, form submission and our child handlers still run.
  for (const event of ["keydown", "keypress", "keyup"])
    panel.addEventListener(event, (e) => e.stopPropagation());
  root.append(sheet, panel);
  document.body.append(host);
  let tab: "groups" | "people" = "groups";
  let shortcutSettings = false,
    recordingShortcut = false;
  let shortcutHint = "";
  const collapsedGroups = new Set<string>();
  let editor: Group | undefined;
  let originalMembers: string[] = [];
  let selectedUser: string | undefined;
  let deletePending = false;
  let formError = "";
  let priorFocus: HTMLElement | null = null;
  const open = () => panel.matches(":popover-open");
  const groups = () => model.groups();
  function syncTheme() {
    const scope =
      document.querySelector(".theme-dark, .theme-light") ??
      document.documentElement;
    const theme = getComputedStyle(scope);
    for (const token of [
      "--font-primary",
      "--font-code",
      "--background-surface-high",
      "--background-surface-higher",
      "--background-floating",
      "--background-secondary",
      "--background-modifier-hover",
      "--text-default",
      "--text-normal",
      "--text-muted",
      "--text-link",
      "--text-brand",
      "--text-danger",
      "--border-subtle",
      "--brand-500",
      "--brand-560",
      "--focus-primary",
      "--interactive-active",
      "--status-positive",
      "--white",
    ]) {
      const value = theme.getPropertyValue(token).trim();
      if (value) host.style.setProperty(token, value);
      else host.style.removeProperty(token);
    }
    // Anchor beside the native lower-left voice controls, when present.
    const area = document.querySelector('[class*="panels_"]');
    const bounds = area?.getBoundingClientRect();
    if (
      bounds &&
      bounds.width > 100 &&
      bounds.height > 30 &&
      bounds.left < innerWidth / 2
    ) {
      panel.style.left = `${Math.min(bounds.left + 12, Math.max(12, innerWidth - 412))}px`;
    }
  }
  function show() {
    if (!open()) {
      priorFocus = document.activeElement as HTMLElement;
      syncTheme();
      render();
      panel.showPopover();
      panel.focus();
    }
  }
  function hide() {
    if (open()) panel.hidePopover();
  }
  function toggle() {
    open() ? hide() : show();
  }
  panel.addEventListener("toggle", () => {
    if (!open()) recordingShortcut = false;
    if (!open() && priorFocus?.isConnected)
      priorFocus.focus({ preventScroll: true });
  });
  function keyboard(e: KeyboardEvent) {
    if (recordingShortcut && open()) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        recordingShortcut = false;
        shortcutHint = "";
        render();
        return;
      }
      const next = recordShortcut(e, isMac);
      if (next) {
        model.setShortcut(next);
        recordingShortcut = false;
        shortcutHint = "";
        render();
      } else if (!["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
        shortcutHint = `Use ${isMac ? "Command" : "Ctrl"} with a letter, number or F1–F12.`;
        render();
      }
      return;
    }
    if (matchesShortcut(e, model.shortcut(), isMac)) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
    if (e.key === "Escape" && open()) {
      e.preventDefault();
      e.stopPropagation();
      hide();
    }
  }
  document.addEventListener("keydown", keyboard, true);
  function commit(next: Group[]) {
    model.change(next);
    status();
  }
  function edit(group?: Group, member?: string) {
    editor = group
      ? structuredClone(group)
      : {
          id: crypto.randomUUID(),
          name: "",
          gain: 1,
          muted: false,
          members: member ? [member] : [],
        };
    originalMembers = group ? [...group.members] : [];
    selectedUser = undefined;
    deletePending = false;
    formError = "";
    render();
    root.querySelector<HTMLInputElement>("#lv-group-name")?.focus();
  }
  function back() {
    editor = undefined;
    selectedUser = undefined;
    shortcutSettings = false;
    recordingShortcut = false;
    formError = "";
    render();
  }
  function assign(userId: string) {
    shortcutSettings = false;
    recordingShortcut = false;
    editor = undefined;
    selectedUser = userId;
    show();
    render();
  }
  function blank(title: string, copy: string) {
    const state = el("div", "empty");
    state.append(el("h2", "", title), el("p", "", copy));
    return state;
  }
  function checkbox(
    name: string,
    detail: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    userId?: string,
  ) {
    const row = el("label", "check");
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = !model.editable();
    input.onchange = () => onChange(input.checked);
    const label = el("span", "grow stack");
    label.append(el("span", "", name));
    if (detail) label.append(el("small", "", detail));
    row.append(input);
    if (userId) row.append(avatar(model.profile(userId)));
    row.append(label);
    return row;
  }
  function renderGroup(g: Group) {
    const card = el("section", "group");
    card.setAttribute("aria-label", g.name);
    const row = el("div", "row");
    const content = el("div", "group-content");
    content.id = `lv-group-content-${g.id}`;
    const name = btn(
      g.name,
      () => {
        if (collapsedGroups.has(g.id)) collapsedGroups.delete(g.id);
        else collapsedGroups.add(g.id);
        syncDisclosure();
      },
      "name disclosure",
    );
    name.dataset.focus = `${g.id}-disclosure`;
    name.setAttribute("aria-controls", content.id);
    function syncDisclosure() {
      content.hidden = collapsedGroups.has(g.id);
      name.setAttribute("aria-expanded", String(!content.hidden));
      name.setAttribute(
        "aria-label",
        `${content.hidden ? "Expand" : "Collapse"} ${g.name}`,
      );
      name.title = `${content.hidden ? "Expand" : "Collapse"} ${g.name}`;
    }
    syncDisclosure();
    const title = el("div", "grow");
    title.append(name);
    const mute = btn(
      g.muted ? "Unmute" : "Mute",
      () => {
        commit(
          groups().map((x) => (x.id === g.id ? { ...x, muted: !x.muted } : x)),
        );
        render();
      },
      "mute",
    );
    mute.setAttribute("aria-pressed", String(g.muted));
    mute.setAttribute("aria-label", `${g.muted ? "Unmute" : "Mute"} ${g.name}`);
    const number = el("input", "inline-number");
    number.type = "number";
    number.min = "0";
    number.max = "200";
    number.step = "1";
    number.value = String(Math.round(g.gain * 100));
    number.setAttribute("aria-label", `${g.name} volume percent`);
    number.dataset.focus = `${g.id}-number`;
    row.append(title, mute, number, el("span", "muted", "%"));
    const people = model.people();
    const present = g.members.filter((id) => people.some((p) => p.id === id));
    const members = el("div", "member-list");
    const memberControls = new Map<
      string,
      { input: HTMLInputElement; reset: HTMLButtonElement; detail: HTMLElement }
    >();
    const range = el("input", "range");
    range.type = "range";
    range.min = "0";
    range.max = "200";
    range.step = "1";
    range.value = number.value;
    range.style.setProperty("--fill", `${g.gain * 50}%`);
    range.setAttribute("aria-label", `${g.name} volume`);
    range.dataset.focus = `${g.id}-range`;
    range.setAttribute(
      "aria-valuetext",
      `${number.value} percent${g.muted ? ", muted" : ""}`,
    );
    function gain(value: number) {
      if (!Number.isFinite(value)) return;
      value = Math.max(0, Math.min(200, Math.round(value)));
      number.value = String(value);
      range.value = String(value);
      range.style.setProperty("--fill", `${value / 2}%`);
      range.setAttribute(
        "aria-valuetext",
        `${value} percent${g.muted ? ", muted" : ""}`,
      );
      commit(
        groups().map((x) => (x.id === g.id ? { ...x, gain: value / 100 } : x)),
      );
      refreshMemberRows();
    }
    range.oninput = () => gain(Number(range.value));
    number.oninput = () => {
      if (
        number.value !== "" &&
        number.valueAsNumber >= 0 &&
        number.valueAsNumber <= 200
      )
        gain(number.valueAsNumber);
    };
    number.onchange = () =>
      gain(
        Number.isFinite(number.valueAsNumber)
          ? number.valueAsNumber
          : Math.round(groups().find((x) => x.id === g.id)!.gain * 100),
      );
    range.ondblclick = () => gain(100);
    for (const control of [range, number, mute])
      control.disabled = !model.editable();
    const scale = el("div", "scale");
    scale.append(
      el("span", "", "0%"),
      el("span", "", "100%"),
      el("span", "", "200%"),
    );
    function setMemberGain(id: string, value: number | undefined) {
      commit(
        groups().map((x) => {
          if (x.id !== g.id) return x;
          const memberGains = { ...x.memberGains };
          if (value === undefined) delete memberGains[id];
          else memberGains[id] = value;
          return { ...x, memberGains };
        }),
      );
      refreshMemberRows();
    }
    function refreshMemberRows() {
      const current = groups().find((x) => x.id === g.id) ?? g;
      for (const [id, controls] of memberControls) {
        const custom = current.memberGains?.[id] !== undefined;
        const value = current.memberGains?.[id] ?? current.gain;
        controls.input.value = String(Math.round(value * 100));
        controls.reset.disabled = !custom || !model.editable();
        controls.detail.textContent = `${custom ? "Custom level" : "Follows group"}${present.includes(id) ? "" : " · Not in voice"}`;
      }
    }
    for (const id of g.members) {
      const member = el("div", "member-row");
      const profile = model.profile(id);
      const label = el("div", "stack grow");
      const displayName = el("span", "truncate", profile.name);
      displayName.title = profile.name;
      label.append(displayName);
      const identity = el("div", "member-identity");
      identity.append(avatar(profile), label);
      const detail = el("small");
      label.append(detail);
      const input = el("input", "inline-number");
      input.type = "number";
      input.min = "0";
      input.max = "200";
      input.step = "1";
      input.setAttribute(
        "aria-label",
        `${model.profile(id).name} volume in ${g.name}`,
      );
      input.dataset.focus = `${g.id}-${id}-custom`;
      input.disabled = !model.editable();
      input.oninput = () => {
        if (
          input.value !== "" &&
          input.valueAsNumber >= 0 &&
          input.valueAsNumber <= 200
        )
          setMemberGain(id, input.valueAsNumber / 100);
      };
      input.onchange = () => {
        if (!Number.isFinite(input.valueAsNumber)) {
          refreshMemberRows();
          return;
        }
        setMemberGain(
          id,
          Math.max(0, Math.min(200, input.valueAsNumber)) / 100,
        );
      };
      const reset = btn(
        "Reset",
        () => setMemberGain(id, undefined),
        "member-reset",
      );
      reset.title = `Use the group volume for ${model.profile(id).name}`;
      reset.setAttribute(
        "aria-label",
        `Reset ${model.profile(id).name} to ${g.name} volume`,
      );
      memberControls.set(id, { input, reset, detail });
      member.append(identity, input, el("span", "muted", "%"), reset);
      members.append(member);
    }
    if (!g.members.length)
      members.append(
        el("small", "", "No members yet. Choose Edit members to add people."),
      );
    refreshMemberRows();
    const bottom = el("div", "group-bottom");
    bottom.append(
      btn("Edit members", () => edit(g), "link"),
      el(
        "small",
        "",
        `${present.length} in voice / ${g.members.length} members${g.autoJoin ? " · Auto-add on" : ""}`,
      ),
    );
    content.append(range, scale, members, bottom);
    card.append(row, content);
    return card;
  }
  function render() {
    const focused = host.contains(document.activeElement)
      ? (document.activeElement as HTMLInputElement)
      : null;
    const key = focused?.dataset.focus;
    panel.replaceChildren();
    const header = el("header", "header");
    const top = el("div", "row");
    if (editor || selectedUser || shortcutSettings) {
      const previous = btn("‹", back, "close");
      previous.setAttribute("aria-label", "Back to mixer");
      top.append(previous);
    }
    const heading = el("div", "grow");
    heading.append(
      el(
        "h1",
        "",
        shortcutSettings
          ? "Quick access"
          : editor
            ? groups().some((g) => g.id === editor!.id)
              ? "Edit group"
              : "New group"
            : selectedUser
              ? model.profile(selectedUser).name
              : "Local Volumes",
      ),
    );
    heading.append(
      el(
        "small",
        "",
        shortcutSettings
          ? "Choose your keyboard shortcut."
          : editor
            ? "Set a name and choose members."
            : selectedUser
              ? "Add this person to one or more groups."
              : "Set everyone’s volume directly. 10% means 10%.",
      ),
    );
    const close = btn("×", hide, "close");
    close.setAttribute("aria-label", "Close Local Volumes");
    if (selectedUser) top.append(avatar(model.profile(selectedUser)));
    top.append(heading, close);
    header.append(top);
    panel.append(header);
    const notice = el("div", "notice");
    notice.id = "lv-notice";
    notice.setAttribute("role", "status");
    panel.append(notice);
    if (!editor && !selectedUser && !shortcutSettings) {
      const tabs = el("div", "tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Mixer views");
      for (const [id, label] of [
        ["groups", "Groups"],
        ["people", `In voice (${model.people().length})`],
      ] as const) {
        const b = btn(
          label,
          () => {
            tab = id;
            render();
          },
          "tab",
        );
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(tab === id));
        b.onkeydown = (e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            tab = tab === "groups" ? "people" : "groups";
            render();
            root.querySelector<HTMLElement>("[aria-selected=true]")?.focus();
          }
        };
        tabs.append(b);
      }
      panel.append(tabs);
    }
    const body = el("div", "body");
    panel.append(body);
    const footer = el("footer", "footer");
    panel.append(footer);
    if (shortcutSettings) {
      const settings = el("div", "editor");
      settings.append(
        el("h2", "", "Open / close the mixer"),
        el("kbd", "shortcut-value", shortcut()),
      );
      const record = btn(
        recordingShortcut ? "Press your shortcut…" : "Change shortcut",
        () => {
          recordingShortcut = true;
          shortcutHint = "";
          render();
        },
        "secondary wide",
      );
      record.dataset.focus = "record-shortcut";
      record.disabled = !model.editable();
      settings.append(record);
      const hint = el(
        "p",
        "hint",
        shortcutHint ||
          (recordingShortcut
            ? `Hold ${isMac ? "Command" : "Ctrl"} and press a letter, number or F1–F12. Add Shift or ${isMac ? "Option" : "Alt"} if you like. Escape cancels.`
            : "Works while Discord is focused. Command on Mac becomes Ctrl on Windows and Linux."),
      );
      hint.setAttribute("role", "status");
      settings.append(hint);
      if (recordingShortcut)
        settings.append(
          btn(
            "Cancel recording",
            () => {
              recordingShortcut = false;
              shortcutHint = "";
              render();
            },
            "link",
          ),
        );
      const reset = btn(
        "Restore default shortcut",
        () => {
          model.setShortcut(undefined);
          recordingShortcut = false;
          shortcutHint = "";
          render();
        },
        "link",
      );
      reset.disabled = !model.editable();
      settings.append(reset);
      body.append(settings);
      footer.append(btn("Done", back, "primary wide"));
    } else if (editor) {
      const draft = editor;
      const form = el("form", "editor");
      const label = el("label", "field", "Group name");
      const input = el("input");
      input.id = "lv-group-name";
      input.dataset.focus = "name";
      input.maxLength = 40;
      input.value = draft.name;
      input.required = true;
      input.oninput = () => {
        draft.name = input.value;
      };
      input.disabled = !model.editable();
      label.append(input);
      form.append(label);
      form.append(
        checkbox(
          "Auto-add joiners",
          "Automatically add arrivals who aren’t in any group yet. Also applies when entering a channel. Existing group memberships are kept.",
          Boolean(draft.autoJoin),
          (checked) => {
            draft.autoJoin = checked;
          },
        ),
      );
      const memberList = el("div");
      memberList.append(el("h2", "", "Members"));
      const ids = [
        ...new Set([...model.people().map((p) => p.id), ...draft.members]),
      ];
      if (!ids.length)
        memberList.append(
          el(
            "p",
            "hint",
            "Join voice to add people. You can create this group now.",
          ),
        );
      for (const id of ids)
        memberList.append(
          checkbox(
            model.profile(id).name,
            model.people().some((p) => p.id === id)
              ? "In this voice channel"
              : "Not in this voice channel",
            draft.members.includes(id),
            (checked) => {
              draft.members = checked
                ? [...draft.members, id]
                : draft.members.filter((x) => x !== id);
            },
            id,
          ),
        );
      form.append(memberList);
      if (formError) form.append(el("p", "error-line", formError));
      const actions = el("div", "row");
      const save = btn(
        groups().some((g) => g.id === draft.id) ? "Save group" : "Create group",
        () => {},
        "primary grow",
      );
      save.type = "submit";
      save.disabled = !model.editable();
      actions.append(btn("Cancel", back, "secondary"), save);
      form.append(actions);
      form.onsubmit = (e) => {
        e.preventDefault();
        if (!draft.name.trim()) {
          formError = "Give the group a name.";
          render();
          return;
        }
        const next = groups().some((g) => g.id === draft.id)
          ? groups().map((g) =>
              g.id === draft.id
                ? {
                    ...g,
                    name: draft.name.trim(),
                    autoJoin: draft.autoJoin,
                    members: mergeEditedMembers(
                      originalMembers,
                      draft.members,
                      g.members,
                    ),
                  }
                : g,
            )
          : [...groups(), { ...draft, name: draft.name.trim() }];
        commit(next);
        back();
      };
      body.append(form);
      if (groups().some((g) => g.id === draft.id))
        footer.append(
          btn(
            deletePending ? "Confirm delete group" : "Delete group",
            () => {
              if (!deletePending) {
                deletePending = true;
                render();
                return;
              }
              commit(groups().filter((g) => g.id !== draft.id));
              back();
            },
            "danger",
          ),
        );
      footer.append(
        el(
          "small",
          "",
          "Removing members restores their usual level unless another group still affects them.",
        ),
      );
    } else if (selectedUser) {
      const id = selectedUser;
      for (const g of groups()) {
        const section = el("section", "group");
        section.setAttribute("aria-label", g.name);
        section.append(
          checkbox(
            g.name,
            `Group volume ${Math.round(g.gain * 100)}%${g.muted ? " (muted)" : ""}`,
            g.members.includes(id),
            (checked) => {
              commit(
                groups().map((x) =>
                  x.id === g.id
                    ? {
                        ...x,
                        members: checked
                          ? [...x.members, id]
                          : x.members.filter((u) => u !== id),
                      }
                    : x,
                ),
              );
              render();
            },
          ),
        );
        body.append(section);
      }
      if (!groups().length)
        body.append(
          blank(
            "No groups yet",
            "Create a group with this person already selected.",
          ),
        );

      footer.append(
        btn("New group", () => edit(undefined, id), "secondary wide"),
      );
    } else if (tab === "groups") {
      if (!groups().length)
        body.append(
          blank(
            "Make room for your conversation",
            "Put people in groups, then adjust everyone together. Individual levels stay yours.",
          ),
        );
      for (const g of groups()) body.append(renderGroup(g));
      const create = btn("+ New group", () => edit(), "secondary wide");
      create.disabled = !model.editable() || groups().length >= 100;
      footer.append(create);
      if (groups().length) {
        const actions = el("div", "row");
        actions.append(
          btn(
            model.paused() ? "Resume mix" : "Pause mix",
            () => {
              model.pause();
              render();
            },
            "link",
          ),
          btn(
            "Reset mix",
            () => {
              commit(
                groups().map((g) => ({
                  ...g,
                  gain: 1,
                  muted: false,
                  memberGains: {},
                })),
              );
              render();
            },
            "link",
          ),
        );
        footer.append(actions);
      }
      footer.append(
        el(
          "small",
          "",
          "Overlapping groups use the lowest level. Pause restores your Discord settings.",
        ),
      );
    } else {
      if (!model.people().length)
        body.append(
          blank(
            model.connected() ? "Just you for now" : "Join a voice channel",
            "People in your current call appear here. Assign them to groups from this list.",
          ),
        );
      for (const p of model.people()) {
        const row = el("div", "person");
        const detail = el("div", "grow stack");
        detail.append(el("strong", "truncate", p.name));
        const names = groups()
          .filter((g) => g.members.includes(p.id))
          .map(
            (g) =>
              `${g.name}${g.memberGains?.[p.id] !== undefined ? ` (${Math.round(g.memberGains[p.id] * 100)}%)` : ""}`,
          );
        detail.append(
          el(
            "small",
            "truncate",
            names.length ? names.join(", ") : "No groups",
          ),
        );
        const manage = btn("Groups", () => assign(p.id), "secondary");
        manage.setAttribute("aria-label", `Groups for ${p.name}`);
        manage.disabled = !model.editable();
        row.append(avatar(p), detail, manage);
        row.oncontextmenu = (e) => {
          e.preventDefault();
          assign(p.id);
        };
        body.append(row);
      }
      footer.append(
        el(
          "small",
          "",
          "Group changes affect only your playback. Nobody else’s settings change.",
        ),
      );
    }
    const meta = el("div", "row");
    if (!shortcutSettings && !editor && !selectedUser) {
      const settings = btn(
        `Shortcut: ${shortcut()}`,
        () => {
          shortcutSettings = true;
          shortcutHint = "";
          render();
        },
        "link",
      );
      settings.setAttribute("aria-label", "Configure quick access shortcut");
      meta.append(settings);
    }
    const saved = el("span", "save");
    saved.id = "lv-save";
    meta.append(saved);
    footer.append(meta);
    status();
    if (key)
      Array.from(root.querySelectorAll<HTMLElement>("[data-focus]"))
        .find((n) => n.dataset.focus === key)
        ?.focus({ preventScroll: true });
  }
  function status() {
    const message = model.error();
    const notice = root.querySelector("#lv-notice");
    const noticeText =
      message ||
      (model.paused()
        ? "Mix paused. Everyone is at their usual level."
        : !model.connected()
          ? "Not in voice. Your groups are ready for the next call."
          : "");
    if (
      notice &&
      notice.textContent !== noticeText + (message ? "Retry" : "")
    ) {
      notice.replaceChildren();
      notice.classList.toggle("error", Boolean(message));
      if (message)
        notice.append(
          el("span", "", message),
          btn(
            "Retry",
            () => {
              model.retry();
              render();
            },
            "link",
          ),
        );
      else notice.textContent = noticeText;
    }
    const saved = root.querySelector("#lv-save");
    if (saved) saved.textContent = model.saveStatus();
  }
  syncTheme();
  render();
  return {
    render,
    status,
    syncTheme,
    assign,
    show,
    reset: () => {
      editor = undefined;
      selectedUser = undefined;
      shortcutSettings = false;
      recordingShortcut = false;
      tab = "groups";
      collapsedGroups.clear();
      render();
    },
    dispose: () => {
      document.removeEventListener("keydown", keyboard, true);
      hide();
      host.remove();
    },
  };
}
