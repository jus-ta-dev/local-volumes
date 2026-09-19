export interface UserProfile {
  name: string;
  avatarUrl?: string;
}
export interface CachedUser {
  username?: string;
  globalName?: string;
  avatar?: string | null;
  discriminator?: string;
}
export interface CachedMember {
  nick?: string | null;
  avatar?: string | null;
}

const snowflake = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,24}$/.test(value);
const avatarHash = (value: unknown): value is string =>
  typeof value === "string" && /^(?:a_)?[a-f0-9]{32}$/.test(value);
const nonempty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

// Read cached presentation fields only. Image paths follow Discord's documented
// CDN endpoints: https://discord.com/developers/docs/reference#image-formatting
// No user/profile API requests, and no names or image URLs in saved settings.
export function cachedProfile(
  userId: string,
  user?: CachedUser,
  guildId?: string,
  member?: CachedMember,
): UserProfile {
  const inGuild = snowflake(guildId);
  const name =
    (inGuild ? nonempty(member?.nick) : undefined) ??
    nonempty(user?.globalName) ??
    nonempty(user?.username) ??
    `User …${userId.slice(-4)}`;
  if (!snowflake(userId)) return { name };
  const cdn = "https://cdn.discordapp.com";
  if (inGuild && avatarHash(member?.avatar))
    return {
      name,
      avatarUrl: `${cdn}/guilds/${guildId}/users/${userId}/avatars/${member.avatar}.webp?size=64`,
    };
  if (avatarHash(user?.avatar))
    return {
      name,
      avatarUrl: `${cdn}/avatars/${userId}/${user.avatar}.webp?size=64`,
    };
  if (!user) return { name };
  const discriminator = user.discriminator;
  const index =
    typeof discriminator === "string" &&
    /^\d{1,4}$/.test(discriminator) &&
    Number(discriminator) > 0
      ? Number(discriminator) % 5
      : Number((BigInt(userId) >> 22n) % 6n);
  return { name, avatarUrl: `${cdn}/embed/avatars/${index}.png` };
}
