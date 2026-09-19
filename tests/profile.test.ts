import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedProfile } from "../src/discord/profile.ts";
import { discover, type Runtime } from "../src/discord/discovery.ts";

const id = "123456789012345678";
const user = {
  username: "mara",
  globalName: "Mara",
  avatar: "a_0123456789abcdef0123456789abcdef",
  discriminator: "0",
};
const member = {
  nick: "Captain Mara",
  avatar: "abcdef0123456789abcdef0123456789",
};

test("server nickname and avatar override the global profile only in that server", () => {
  assert.deepEqual(cachedProfile(id, user, "999", member), {
    name: "Captain Mara",
    avatarUrl: `https://cdn.discordapp.com/guilds/999/users/${id}/avatars/${member.avatar}.webp?size=64`,
  });
  assert.deepEqual(cachedProfile(id, user, undefined, member), {
    name: "Mara",
    avatarUrl: `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.webp?size=64`,
  });
});
test("missing server presentation falls back to display name, username, then unknown user", () => {
  assert.equal(
    cachedProfile(id, user, "999", { nick: " ", avatar: null }).name,
    "Mara",
  );
  assert.equal(
    cachedProfile(id, { username: "mara", globalName: "" }).name,
    "mara",
  );
  assert.deepEqual(cachedProfile(id), { name: "User …5678" });
});
test("default avatars support migrated and legacy accounts; malformed hashes cannot become URLs", () => {
  assert.equal(
    cachedProfile("20971520", { username: "New", discriminator: "0" })
      .avatarUrl,
    "https://cdn.discordapp.com/embed/avatars/5.png",
  );
  assert.equal(
    cachedProfile(id, { username: "Old", discriminator: "1337" }).avatarUrl,
    "https://cdn.discordapp.com/embed/avatars/2.png",
  );
  const profile = cachedProfile(
    id,
    { ...user, avatar: "../../private" },
    "999",
    { avatar: "https://example.com/tracker" },
  );
  assert.match(
    profile.avatarUrl!,
    /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
  );
  assert.equal(
    cachedProfile("../invalid", user, "999", member).avatarUrl,
    undefined,
  );
  assert.equal(cachedProfile(id, user, "../invalid", member).name, "Mara");
});

function withRuntime(
  run: (r: Runtime, state: { guildId?: string; member: typeof member }) => void,
) {
  const state = { guildId: "999" as string | undefined, member: { ...member } };
  const r: Runtime = {
    m: {
      media: function () {
        /* MediaEngineStore getLocalVolume getMediaEngine */
      },
      voice: function () {
        /* static displayName="VoiceStateStore" getVoiceStatesForChannel */
      },
      rtc: function () {
        /* static displayName="RTCConnectionStore" getRTCConnection */
      },
      users: function () {
        /* static displayName="UserStore" getCurrentUser */
      },
      members: function () {
        /* static displayName="GuildMemberStore" */
      },
      channels: function () {
        /* static displayName="ChannelStore" */
      },
    },
    c: {
      media: { exports: { getLocalVolume() {}, getMediaEngine() {} } },
      voice: { exports: { getVoiceStatesForChannel() {} } },
      rtc: { exports: { getRTCConnection: () => ({ channelId: "call" }) } },
      users: { exports: { getCurrentUser() {}, getUser: () => user } },
      members: {
        exports: {
          getMember: (guildId: string, userId: string) => {
            assert.equal(guildId, "999");
            assert.equal(userId, id);
            return state.member;
          },
        },
      },
      channels: {
        exports: {
          getChannel: (channelId: string) => {
            assert.equal(channelId, "call");
            return { guild_id: state.guildId };
          },
        },
      },
    },
  };
  const chunks: any[] = [];
  chunks.push = (...items: any[]) => {
    for (const entry of items) entry[2](r);
    return 0;
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { webpackChunkdiscord_app: chunks },
  });
  try {
    run(r, state);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
test("adapter reads current call server and updated cached profiles without retaining stale nicknames", () => {
  withRuntime((_r, state) => {
    const adapter = discover();
    assert.equal(adapter.userProfile(id).name, "Captain Mara");
    assert.match(adapter.userProfile(id).avatarUrl!, /\/guilds\/999\//);
    state.member = { ...member, nick: "Navigator" };
    assert.equal(adapter.userProfile(id).name, "Navigator");
    state.guildId = undefined;
    assert.equal(adapter.userProfile(id).name, "Mara");
    assert.doesNotMatch(adapter.userProfile(id).avatarUrl!, /\/guilds\//);
  });
});
test("missing or failing optional profile stores leave core discovery available", () => {
  withRuntime((r) => {
    delete r.c.members;
    assert.equal(discover().userProfile(id).name, "Mara");
    r.c.channels.exports = {
      getChannel() {
        throw new Error("Changed optional capability");
      },
    };
    assert.equal(discover().userProfile(id).name, "Mara");
  });
});
