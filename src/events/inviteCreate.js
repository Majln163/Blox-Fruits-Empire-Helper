import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteCreate,
  once: false,

  async execute(invite, client) {
    try {
      if (!invite.guild) return;
      if (!client.inviteCache) client.inviteCache = new Map();

      const guildCache = client.inviteCache.get(invite.guild.id) ?? new Map();
      guildCache.set(invite.code, invite.uses ?? 0);
      client.inviteCache.set(invite.guild.id, guildCache);

      logger.debug(`Invite created and cached: ${invite.code} for guild ${invite.guild.id}`);
    } catch (err) {
      logger.error('Error caching new invite:', err);
    }
  },
};
