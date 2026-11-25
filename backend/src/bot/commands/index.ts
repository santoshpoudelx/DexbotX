import { banCommand } from './ban';
import { kickCommand } from './kick';
import { timeoutCommand } from './timeout';
import { unbanCommand } from './unban';
import { untimeoutCommand } from './untimeout';
import { economyCommands } from './economy';

export const moderationCommands = [kickCommand, banCommand, unbanCommand, timeoutCommand, untimeoutCommand, ...economyCommands];
