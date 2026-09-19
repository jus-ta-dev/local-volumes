import type { Group } from "./config.ts";

export class JoinTracker {
  private channel: string | undefined;
  private present = new Set<string>();
  reset(): void {
    this.channel = undefined;
    this.present.clear();
  }
  update(channel: string | undefined, userIds: string[]): string[] {
    if (!channel) {
      this.reset();
      return [];
    }
    const next = new Set(userIds);
    const joined = [...next].filter(
      (id) => channel !== this.channel || !this.present.has(id),
    );
    this.channel = channel;
    this.present = next;
    return joined;
  }
}

export function autoAddJoiners(
  groups: Group[],
  joined: string[],
): { groups: Group[]; full: boolean } {
  if (!joined.length) return { groups, full: false };
  // Saved membership survives departure. A rejoin must not add a second group
  // (and unexpectedly change playback) for someone already assigned anywhere.
  // Snapshot before adding so unassigned arrivals still follow all
  // enabled auto-add rules, independently of group order.
  const assigned = new Set(groups.flatMap((group) => group.members));
  const unassigned = [...new Set(joined)].filter((id) => !assigned.has(id));
  if (!unassigned.length) return { groups, full: false };
  let changed = false,
    full = false;
  const next = groups.map((group) => {
    if (!group.autoJoin) return group;
    const members = new Set(group.members);
    for (const id of unassigned) {
      if (members.has(id)) continue;
      if (members.size >= 500) {
        full = true;
        continue;
      }
      members.add(id);
    }
    if (members.size === group.members.length) return group;
    changed = true;
    return { ...group, members: [...members] };
  });
  return { groups: changed ? next : groups, full };
}

// Preserve people auto-added while a group editor was open. Only apply the
// membership additions/removals the editor actually made against its snapshot.
export function mergeEditedMembers(
  original: string[],
  edited: string[],
  current: string[],
): string[] {
  const removed = new Set(original.filter((id) => !edited.includes(id)));
  const added = edited.filter((id) => !original.includes(id));
  return [...new Set([...current.filter((id) => !removed.has(id)), ...added])];
}
