import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteDelete,
  once: false,

  async execute(invite, client) {
    try {
      if (!invite.guild) return;
      client.inviteCache?.get(invite.guild.id)?.delete(invite.code);
      logger.debug(`Invite deleted from cache: ${invite.code} for guild ${invite.guild.id}`);
    } catch (err) {
      logger.error('Error removing deleted invite from cache:', err);
    }
  },
};
