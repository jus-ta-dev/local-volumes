import { validateShortcut, type Shortcut } from "./shortcut.ts";
import { MAX_RAW, displayedPercentToRaw } from "../discord/volume.ts";
export { MAX_RAW } from "../discord/volume.ts";
export interface Group {
  id: string;
  name: string;
  gain: number;
  muted: boolean;
  members: string[];
  autoJoin?: boolean;
  memberGains?: Record<string, number>;
}
export interface Configuration {
  version: 3;
  profiles: Record<string, { groups: Group[] }>;
  shortcut?: Shortcut;
}
export const emptyConfig = (): Configuration => ({ version: 3, profiles: {} });
const id = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,24}$/.test(v);

export function validateConfig(input: unknown): Configuration {
  const c = input as Configuration & { version: number };
  if (
    !c ||
    ![1, 2, 3].includes(c.version) ||
    !c.profiles ||
    typeof c.profiles !== "object" ||
    Array.isArray(c.profiles) ||
    Object.keys(c.profiles).length > 20
  )
    throw new Error("Invalid local group configuration.");
  const result = emptyConfig();
  if (c.shortcut !== undefined) result.shortcut = validateShortcut(c.shortcut);
  for (const [account, profile] of Object.entries(c.profiles)) {
    if (
      !id(account) ||
      !profile ||
      !Array.isArray(profile.groups) ||
      profile.groups.length > 100
    )
      throw new Error("Invalid group profile.");
    const seen = new Set<string>();
    const groups = profile.groups.map((g) => {
      if (
        !g ||
        typeof g.id !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(g.id) ||
        seen.has(g.id) ||
        typeof g.name !== "string" ||
        !g.name.trim() ||
        g.name.length > 40 ||
        !Number.isFinite(g.gain) ||
        g.gain < 0 ||
        g.gain > 2 ||
        typeof g.muted !== "boolean" ||
        (g.autoJoin !== undefined && typeof g.autoJoin !== "boolean") ||
        !Array.isArray(g.members) ||
        g.members.length > 500 ||
        !g.members.every(id)
      )
        throw new Error("Invalid group settings.");
      seen.add(g.id);
      const memberGains: Record<string, number> = {};
      if (g.memberGains !== undefined) {
        if (
          !g.memberGains ||
          typeof g.memberGains !== "object" ||
          Array.isArray(g.memberGains) ||
          Object.keys(g.memberGains).length > 500
        )
          throw new Error("Invalid personal group volumes.");
        for (const [user, gain] of Object.entries(g.memberGains)) {
          if (!id(user) || !Number.isFinite(gain) || gain < 0 || gain > 2)
            throw new Error("Invalid personal group volume.");
          if (g.members.includes(user)) memberGains[user] = gain;
        }
      }
      return {
        id: g.id,
        name: g.name.trim(),
        gain: g.gain,
        muted: g.muted,
        members: [...new Set(g.members)],
        autoJoin: g.autoJoin ?? false,
        memberGains,
      };
    });
    result.profiles[account] = { groups };
  }
  return result;
}

// Stored gain fields retain their 0..2 encoding, but represent absolute levels.
// When groups overlap, the quietest assigned level wins; never multiply them.
export function assignedPercent(
  groups: Group[],
  userId: string,
): number | undefined {
  let level: number | undefined;
  for (const g of groups) {
    if (!g.members.includes(userId)) continue;
    const percent = (g.muted ? 0 : (g.memberGains?.[userId] ?? g.gain)) * 100;
    level = level === undefined ? percent : Math.min(level, percent);
  }
  return level;
}
export function effectiveVolume(
  baseline: number,
  groups: Group[],
  userId: string,
): number {
  if (!Number.isFinite(baseline) || baseline < 0 || baseline > MAX_RAW + 1e-6)
    throw new Error("Unsupported individual volume.");
  const percent = assignedPercent(groups, userId);
  // Only unassigned/paused users return to their saved Discord preference.
  if (percent === undefined) return Math.min(MAX_RAW, baseline);
  return displayedPercentToRaw(percent);
}
