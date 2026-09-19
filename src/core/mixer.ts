import { effectiveVolume, assignedPercent, type Group } from "./config.ts";
import type { PlaybackTarget } from "../discord/playback.ts";

export interface MixerAdapter {
  participants(): { id: string; name: string; raw: number }[];
  target(userId: string): PlaybackTarget;
}
const same = (a: number, b: number) =>
  Number.isFinite(a) && Math.abs(a - b) < 1e-6;

export class Mixer {
  private targets = new Map<string, PlaybackTarget>();
  error = "";
  paused = false;

  reconcile(adapter: MixerAdapter, groups: Group[]): void {
    if (this.error) return;
    try {
      const people = adapter.participants();
      const present = new Set(people.map((p) => p.id));
      for (const [id, target] of this.targets) {
        if (!target.isCurrent()) {
          this.targets.delete(id);
          continue;
        }
        if (
          this.paused ||
          !present.has(id) ||
          assignedPercent(groups, id) === undefined
        ) {
          this.restore(target);
          this.targets.delete(id);
        }
      }
      if (this.paused) return;
      for (const person of people) {
        if (assignedPercent(groups, person.id) === undefined) continue;
        let target = this.targets.get(person.id);
        if (!target) {
          target = adapter.target(person.id);
          // Do not take ownership of an unrelated override already in progress.
          if (!same(target.readPlayback(), target.readBaseline()))
            throw new Error(
              "Another playback override is active. Pause it before using groups.",
            );
          this.targets.set(person.id, target);
        }
        const desired = effectiveVolume(
          target.readBaseline(),
          groups,
          person.id,
        );
        if (!same(target.readPlayback(), desired)) {
          target.writePlayback(desired);
          if (!same(target.readPlayback(), desired))
            throw new Error("Playback write did not match.");
        }
      }
    } catch {
      this.error =
        "Mix paused after a playback error. Retry restoration before resuming.";
      this.paused = true;
      this.restoreAll();
    }
  }
  private restore(target: PlaybackTarget): void {
    if (!target.isCurrent()) return;
    const baseline = effectiveVolume(target.readBaseline(), [], target.userId);
    target.writePlayback(baseline);
    if (!same(target.readPlayback(), baseline))
      throw new Error("Restoration could not be verified.");
  }
  restoreAll(): boolean {
    let okay = true;
    for (const [id, target] of this.targets) {
      try {
        this.restore(target);
        this.targets.delete(id);
      } catch {
        okay = false;
      }
    }
    if (!okay)
      this.error =
        "Restoration failed. Retry restoration or fully quit Discord.";
    return okay;
  }
  retry(): void {
    if (this.restoreAll()) this.error = "";
  }
}
