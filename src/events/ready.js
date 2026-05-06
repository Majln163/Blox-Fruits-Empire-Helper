import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      if (config.bot.presence) {
        client.user.setPresence(config.bot.presence);
      }

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      client.inviteCache = new Map();
      for (const [, guild] of client.guilds.cache) {
        try {
          const invites = await guild.fetchInvites();
          const cache = new Map();
          invites.forEach((inv) => cache.set(inv.code, inv.uses ?? 0));
          client.inviteCache.set(guild.id, cache);
          logger.debug(`Cached ${cache.size} invite(s) for guild ${guild.id}`);
        } catch {
          logger.debug(`No invite access for guild ${guild.id} (missing Manage Guild?)`);
        }
      }
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};


