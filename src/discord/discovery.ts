import type { PlaybackTarget } from "./playback.ts";
import { writePlaybackChecked } from "./playback.ts";
import { cachedProfile, type UserProfile } from "./profile.ts";
export { rawToDisplayedPercent } from "./volume.ts";

type AnyModule = Record<string, any>;
export type Runtime = {
  m: Record<string, Function>;
  c: Record<string, { exports: unknown; loaded?: boolean }>;
};
export type Participant = UserProfile & { id: string; raw: number };
export interface DiscordAdapter {
  participants(): Participant[];
  target(userId: string): PlaybackTarget;
  accountId(): string | undefined;
  userProfile(userId: string): UserProfile;
  connected(): boolean;
  channelId(): string | undefined;
}

export function selectRuntime(candidates: Runtime[]): Runtime {
  const matches = [...new Set(candidates)].filter(
    (r) =>
      r?.m &&
      r.c &&
      Object.values(r.m).some((factory) => {
        const source = Function.prototype.toString.call(factory);
        return (
          source.includes("MediaEngineStore") &&
          source.includes("getLocalVolume")
        );
      }),
  );
  if (matches.length !== 1)
    throw new Error(
      `No unique Discord app runtime (${matches.length} candidates).`,
    );
  return matches[0];
}

function runtime(): Runtime {
  const chunks = (window as any).webpackChunkdiscord_app;
  if (!Array.isArray(chunks) || chunks.push === Array.prototype.push)
    throw new Error("Discord modules are not ready. Refresh after login.");
  const candidates: Runtime[] = [];
  const entry = [
    [`local-volumes-${Date.now()}`],
    {},
    (r: Runtime) => {
      candidates.push(r);
    },
  ];
  chunks.push(entry);
  const index = chunks.indexOf(entry);
  if (index !== -1) chunks.splice(index, 1);
  return selectRuntime(candidates);
}

function resolve(r: Runtime, markers: string[], methods: string[]): AnyModule {
  const factories = Object.entries(r.m).filter(([, factory]) => {
    const source = Function.prototype.toString.call(factory);
    return markers.every((marker) => source.includes(marker));
  });
  if (factories.length !== 1)
    throw new Error(
      `Unsupported discovery: ${markers[0]} (${factories.length} candidates).`,
    );
  const cached = r.c[factories[0][0]];
  if (!cached || cached.loaded === false)
    throw new Error(`${markers[0]} is not loaded. Open voice and refresh.`);
  const exports = cached.exports as AnyModule;
  const candidates = [exports];
  // Only inspect exports of the specifically identified, already-loaded module.
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(exports),
  )) {
    try {
      candidates.push(
        descriptor.get ? descriptor.get.call(exports) : descriptor.value,
      );
    } catch {
      /* no match */
    }
  }
  const matches = [...new Set(candidates)].filter(
    (v) => v && methods.every((method) => typeof v[method] === "function"),
  );
  if (matches.length !== 1)
    throw new Error(`Ambiguous capability: ${markers[0]}.`);
  return matches[0];
}

export function discover(): DiscordAdapter {
  const r = runtime();
  const media = resolve(
    r,
    ["MediaEngineStore", "getLocalVolume", "getMediaEngine"],
    ["getLocalVolume", "getMediaEngine"],
  );
  const voice = resolve(
    r,
    ['static displayName="VoiceStateStore"', "getVoiceStatesForChannel"],
    ["getVoiceStatesForChannel"],
  );
  const rtc = resolve(
    r,
    ['static displayName="RTCConnectionStore"', "getRTCConnection"],
    ["getRTCConnection"],
  );
  const users = resolve(
    r,
    ['static displayName="UserStore"', "getCurrentUser"],
    ["getCurrentUser", "getUser"],
  );
  // Presentation capabilities are optional; a missing store must not stop audio.
  let members: AnyModule | undefined, channels: AnyModule | undefined;
  try {
    members = resolve(
      r,
      ['static displayName="GuildMemberStore"'],
      ["getMember"],
    );
  } catch {
    /* global profile fallback */
  }
  try {
    channels = resolve(
      r,
      ['static displayName="ChannelStore"'],
      ["getChannel"],
    );
  } catch {
    /* global profile fallback */
  }

  function userProfile(id: string): UserProfile {
    let user, guildId, member;
    try {
      user = users.getUser(id);
    } catch {
      /* unknown user fallback */
    }
    try {
      const channelId = rtc.getRTCConnection()?.channelId;
      guildId = channelId
        ? channels?.getChannel(channelId)?.guild_id
        : undefined;
      member = guildId ? members?.getMember(guildId, id) : undefined;
    } catch {
      /* presentation lookup must not pause playback */
    }
    return cachedProfile(id, user, guildId, member);
  }

  function active() {
    const call = rtc.getRTCConnection();
    if (
      !call ||
      typeof call.getMediaEngineConnectionId !== "function" ||
      typeof call.channelId !== "string"
    )
      throw new Error("Join a voice channel, then refresh.");
    const connectionId = call.getMediaEngineConnectionId();
    if (!connectionId) throw new Error("Voice connection is not ready.");
    const engine = media.getMediaEngine();
    if (typeof engine?.eachConnection !== "function")
      throw new Error("Unsupported media engine.");
    const matches: AnyModule[] = [];
    engine.eachConnection((connection: AnyModule) => {
      if (
        connection.mediaEngineConnectionId === connectionId &&
        connection.context === "default"
      )
        matches.push(connection);
    }, "default");
    if (matches.length !== 1)
      throw new Error("No unique active voice playback connection.");
    const connection = matches[0];
    if (
      typeof connection.setLocalVolume !== "function" ||
      typeof connection.getLocalVolume !== "function"
    )
      throw new Error("Missing playback capability.");
    // Raw volume units depend on this native desktop wrapper.
    const setter = Function.prototype.toString.call(connection.setLocalVolume);
    const getter = Function.prototype.toString.call(connection.getLocalVolume);
    if (
      !setter.includes("this.conn.setLocalVolume(") ||
      !setter.includes("this.getLocalVolume(") ||
      !getter.includes("this.localVolumes[") ||
      !getter.includes("/")
    )
      throw new Error("Unrecognized playback units; mixer disabled.");
    return {
      call,
      connection,
      connectionId,
      channelId: call.channelId as string,
    };
  }

  function participants(): Participant[] {
    if (!rtc.getRTCConnection()?.getMediaEngineConnectionId?.()) return [];
    const { channelId } = active();
    const selfId = users.getCurrentUser()?.id;
    if (!selfId) throw new Error("Sign into Discord manually, then refresh.");
    return Object.values(
      voice.getVoiceStatesForChannel(channelId) as Record<string, AnyModule>,
    )
      .filter((v) => v.channelId === channelId && v.userId !== selfId)
      .map((v) => ({
        id: v.userId,
        ...userProfile(v.userId),
        raw: media.getLocalVolume(v.userId, "default"),
      }));
  }

  return {
    participants,
    accountId: () => users.getCurrentUser()?.id,
    userProfile,
    connected: () =>
      Boolean(rtc.getRTCConnection()?.getMediaEngineConnectionId?.()),
    channelId: () => rtc.getRTCConnection()?.channelId ?? undefined,
    target(userId) {
      if (!participants().some((p) => p.id === userId))
        throw new Error("Participant is no longer in this voice channel.");
      const snapshot = active();
      return {
        userId,
        readBaseline: () => media.getLocalVolume(userId, "default"),
        readPlayback: () => snapshot.connection.getLocalVolume(userId) * 100,
        writePlayback: (raw) =>
          writePlaybackChecked(snapshot.connection, userId, raw),
        isCurrent: () => {
          const call = rtc.getRTCConnection();
          if (
            !call ||
            call.getMediaEngineConnectionId() !== snapshot.connectionId ||
            call.channelId !== snapshot.channelId
          )
            return false;
          let present = false;
          media.getMediaEngine().eachConnection((connection: AnyModule) => {
            if (connection === snapshot.connection) present = true;
          }, "default");
          return present;
        },
      };
    },
  };
}
