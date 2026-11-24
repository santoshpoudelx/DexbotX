import { z } from 'zod';
import { ECONOMY_DEFAULTS, ECONOMY_LIMITS } from './economy.constants';

const boundedInt = (name: keyof typeof ECONOMY_LIMITS) =>
  z.number().int().min(ECONOMY_LIMITS[name][0]).max(ECONOMY_LIMITS[name][1], `must be at most ${ECONOMY_LIMITS[name][1]}`);

export const economySettingsSchema = z.object({
  currencyName: z.string().regex(/^[A-Za-z0-9]{1,12}$/).transform(() => 'Dex'),
  economyName: z.string()
    .regex(/^[A-Za-z0-9 -]{1,32}$/)
    .refine((value) => value.trim().length > 0 && value === value.trim(), 'Economy name cannot be blank or padded'),
  dailyAmount: boundedInt('dailyAmount'),
  streakStep: boundedInt('streakStep'),
  streakCapDays: boundedInt('streakCapDays'),
  dailyBoostBonus: boundedInt('dailyBoostBonus'),
  stealAmount: boundedInt('stealAmount'),
  minSteal: boundedInt('minSteal'),
  protectionThreshold: boundedInt('protectionThreshold'),
  weeklyGiftSendLimit: boundedInt('weeklyGiftSendLimit'),
  weeklyGiftReceiveLimit: boundedInt('weeklyGiftReceiveLimit'),
  minAccountAgeDays: boundedInt('minAccountAgeDays'),
  minServerHours: boundedInt('minServerHours'),
  bountyMin: boundedInt('bountyMin'),
  bountyMax: boundedInt('bountyMax'),
  commandCooldownSeconds: boundedInt('commandCooldownSeconds'),
  timezone: z.string().min(1).max(100),
  heistAnnounceChannelId: z.string().regex(/^\d{17,20}$/).nullable().default(null),
  pingVictim: z.boolean(),
  mirrorHeistsToAnnouncements: z.boolean(),
  announcementEvents: z.object({
    gifts: z.boolean(),
    rolePurchases: z.boolean(),
    customTitles: z.boolean(),
    streakMilestones: z.boolean(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.minSteal > value.stealAmount) {
    ctx.addIssue({ code: 'custom', path: ['minSteal'], message: 'minSteal cannot exceed stealAmount' });
  }
  if (value.bountyMin > value.bountyMax) {
    ctx.addIssue({ code: 'custom', path: ['bountyMin'], message: 'bountyMin cannot exceed bountyMax' });
  }
});

export type EconomySettings = z.infer<typeof economySettingsSchema>;
export const defaultEconomySettings = (): EconomySettings => ({
  ...ECONOMY_DEFAULTS,
  announcementEvents: { ...ECONOMY_DEFAULTS.announcementEvents },
});
