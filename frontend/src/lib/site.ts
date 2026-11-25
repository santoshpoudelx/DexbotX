interface SiteConfig {
  brandName: string;
  title: string;
  description: string;
  keywords: readonly string[];
  tagline: string;
  creator: string;
  siteUrl: string;
  githubUrl: string;
  discordSupportUrl: string;
  youtubeProfileUrl?: string;
  profileUrls: readonly string[];
  socialImage: {
    url: string;
    width: number;
    height: number;
  };
}

const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/Iamsantoshpoudel';
export function normalizeExternalUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const value = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

const youtubeProfileUrl = normalizeExternalUrl(process.env.NEXT_PUBLIC_YOUTUBE_PROFILE_URL);
const optionalProfileUrls = [
  process.env.NEXT_PUBLIC_X_PROFILE_URL,
  process.env.NEXT_PUBLIC_TWITCH_PROFILE_URL,
  process.env.NEXT_PUBLIC_INSTAGRAM_PROFILE_URL,
  process.env.NEXT_PUBLIC_LINKEDIN_PROFILE_URL,
].map(normalizeExternalUrl).filter((url): url is string => Boolean(url));

const keywords = [
  'DexBotX',
  'Dex bot for Discord',
  'DexBot',
  'Dexbot Discord bot',
  'Dexbot Discord bot with dashboard',
  'DexBotX Discord bot',
  'Discord bot',
  'free Discord bot',
  'open source Discord bot',
  'Discord moderation bot',
  'Discord welcome bot',
  'Discord auto role bot',
  'Discord anti spam bot',
  'Discord YouTube notification bot',
  'Discord Kick notification bot',
  'Discord AI chat bot',
  'Discord bot with dashboard',
  'all in one Discord bot',
];

export const SITE = {
  brandName: 'DexBotX',
  title: 'DexBotX: Free Open Source Discord Bot for Your Server',
  description:
    'DexBotX is a fast, reliable, free and open-source Discord bot with easy web dashboard setup for moderation, auto roles, welcome and goodbye, and an opt-in Dex economy.',
  keywords: [...new Set(keywords)],
  tagline:
    'Fast and reliable Discord automation, free and open source, with easy web dashboard setup for moderation, auto roles, welcome and goodbye, and an opt-in Dex economy.',
  creator: 'DexGameX',
  siteUrl: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dexbotx.vercel.app').origin,
  githubUrl,
  discordSupportUrl:
    process.env.NEXT_PUBLIC_DISCORD_SUPPORT_URL
    ?? process.env.NEXT_PUBLIC_DISCORD_SERVER_URL
    ?? 'https://discord.gg/RVy67hyCZ',
  ...(youtubeProfileUrl ? { youtubeProfileUrl } : {}),
  profileUrls: [githubUrl, ...(youtubeProfileUrl ? [youtubeProfileUrl] : []), ...optionalProfileUrls],
  socialImage: {
    url: '/assets/dexbotx-og-banner.jpg',
    width: 1200,
    height: 630,
  },
} satisfies SiteConfig;
