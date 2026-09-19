import {
  discover,
  type DiscordAdapter,
  type Participant,
} from "../discord/discovery.ts";
import { installContextMenu } from "../discord/context-menu.ts";
import { installAudioMenu } from "../discord/audio-menu.ts";
import {
  emptyConfig,
  validateConfig,
  type Configuration,
  type Group,
} from "../core/config.ts";
import { Mixer } from "../core/mixer.ts";
import { JoinTracker, autoAddJoiners } from "../core/joiners.ts";
import { mountMixer } from "./mixer-view.ts";
import { defaultShortcut, shortcutLabel } from "../core/shortcut.ts";

export function startMixer(
  initial:
    | { config: Configuration; storageError?: string; storageVersion?: number }
    | undefined,
  makeAdapter: () => DiscordAdapter = discover,
) {
  const mixer = new Mixer();
  const joiners = new JoinTracker();
  let config = emptyConfig(),
    storageError = initial?.storageError ?? "";
  if (!initial)
    storageError = "Fully quit and reopen Discord once to enable saved groups.";
  else
    try {
      config = validateConfig(initial.config);
    } catch {
      storageError =
        "Saved groups are invalid. They have not been overwritten.";
    }
  if (initial && initial.storageVersion !== 3 && !storageError)
    storageError =
      "Fully quit and reopen Discord to enable saved shortcut settings.";
  let adapter: DiscordAdapter | undefined;
  let account: string | undefined;
  let people: Participant[] = [];
  let connected = false,
    disposed = false;
  let connectionError = "",
    saveError = "";
  let revision = 0,
    savedRevision = 0,
    failedRevision = 0,
    changedAt = 0;
  const groups = () =>
    account ? (config.profiles[account]?.groups ?? []) : [];
  function connect() {
    try {
      adapter = makeAdapter();
      connectionError = "";
      tick();
    } catch {
      connectionError =
        "Discord voice controls are not ready or this build is unsupported. Retry after signing in.";
    }
  }
  function change(next: Group[]) {
    if (!account || storageError) return;
    try {
      config = validateConfig({
        ...config,
        profiles: { ...config.profiles, [account]: { groups: next } },
      });
      revision++;
      changedAt = Date.now();
      saveError = "";
      failedRevision = 0;
      if (adapter) mixer.reconcile(adapter, groups());
    } catch {
      connectionError =
        "Could not apply group settings. Check the name, volume and member limits.";
    }
  }
  const view = mountMixer({
    shortcut: () => config.shortcut ?? defaultShortcut(),
    setShortcut: (shortcut) => {
      if (storageError) return;
      config = validateConfig({ ...config, shortcut });
      revision++;
      changedAt = Date.now();
      saveError = "";
      failedRevision = 0;
    },
    groups,
    people: () => people,
    profile: (id) =>
      adapter?.userProfile(id) ?? { name: `User …${id.slice(-4)}` },
    connected: () => connected,
    editable: () => Boolean(account) && !storageError,
    paused: () => mixer.paused,
    error: () => storageError || mixer.error || connectionError || saveError,
    saveStatus: () =>
      saveError
        ? "Not saved"
        : revision > savedRevision
          ? "Saving locally…"
          : "Saved on this device",
    change,
    pause: () => {
      if (mixer.error) return;
      mixer.paused = !mixer.paused;
      if (mixer.paused) mixer.restoreAll();
      else if (adapter) mixer.reconcile(adapter, groups());
    },
    retry: () => {
      failedRevision = 0;
      saveError = "";
      mixer.retry();
      connect();
    },
  });
  let lastPeople = "";
  function tick() {
    if (!adapter || disposed) return;
    try {
      const nextAccount = adapter.accountId();
      if (account !== nextAccount) {
        if (!mixer.restoreAll()) {
          view.status();
          return;
        }
        account = nextAccount;
        people = [];
        lastPeople = "";
        joiners.reset();
        view.reset();
      }
      const next = account ? adapter.participants() : [];
      const signature = JSON.stringify(next);
      const nextConnected = adapter.connected();
      let changed = signature !== lastPeople || nextConnected !== connected;
      people = next;
      connected = nextConnected;
      const joined = joiners.update(
        nextConnected ? adapter.channelId() : undefined,
        next.map((p) => p.id),
      );
      if (account && !storageError) {
        const currentGroups = groups();
        const updated = autoAddJoiners(currentGroups, joined);
        if (updated.groups !== currentGroups) {
          change(updated.groups);
          changed = true;
        }
        if (updated.full)
          connectionError =
            "An auto-join group reached 500 members. Some joiners were not added; remove old members to make space.";
      }
      if (account && !storageError) mixer.reconcile(adapter, groups());
      if (changed) {
        lastPeople = signature;
        view.render();
      } else view.status();
    } catch {
      mixer.paused = true;
      mixer.restoreAll();
      connectionError =
        "Voice integration changed. Mix paused; retry when the call is ready.";
      adapter = undefined;
      people = [];
      connected = false;
      view.render();
    }
  }
  connect();
  view.render();
  let startupAttempts = 0;
  const startup = window.setInterval(() => {
    if (adapter || ++startupAttempts > 10) {
      clearInterval(startup);
      return;
    }
    connect();
    view.status();
  }, 1000);
  const interval = window.setInterval(tick, 300);
  const themeInterval = window.setInterval(() => view.syncTheme(), 1500);
  const removeMenu = installContextMenu(
    () => people,
    (id) => view.assign(id),
  );
  const removeAudioMenu = installAudioMenu(
    () => view.show(),
    () =>
      shortcutLabel(
        config.shortcut ?? defaultShortcut(),
        /Mac/.test(navigator.platform),
      ),
  );
  const pagehide = () => {
    mixer.paused = true;
    mixer.restoreAll();
  };
  window.addEventListener("pagehide", pagehide);
  const status = () => ({
    version: 3,
    disposed,
    state: mixer.error
      ? "restore-required"
      : mixer.paused
        ? "paused"
        : connected
          ? "mixing"
          : "ready",
    participantCount: people.length,
    groupCount: groups().length,
    capabilitiesResolved: Boolean(adapter),
    message: storageError || mixer.error || connectionError || saveError,
  });
  return Object.freeze({
    status,
    snapshot: () => ({
      status: status(),
      pending:
        revision > savedRevision &&
        failedRevision !== revision &&
        Date.now() - changedAt >= 200 &&
        !storageError
          ? { revision, config }
          : undefined,
    }),
    saved: (rev: number, error: string) => {
      if (!Number.isSafeInteger(rev) || rev > revision) return;
      if (error) {
        failedRevision = rev;
        saveError = error;
      } else {
        savedRevision = Math.max(savedRevision, rev);
        saveError = "";
      }
      view.status();
    },
    dispose: () => {
      mixer.paused = true;
      if (!mixer.restoreAll()) {
        view.status();
        return false;
      }
      disposed = true;
      clearInterval(startup);
      clearInterval(interval);
      clearInterval(themeInterval);
      removeMenu();
      removeAudioMenu();
      window.removeEventListener("pagehide", pagehide);
      view.dispose();
      return true;
    },
  });
}
