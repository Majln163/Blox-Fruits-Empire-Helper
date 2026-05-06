import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel, getUserLevelData } from '../../services/leveling.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PAGE_SIZE = 10;

function progressBar(xp, xpNeeded, length = 12) {
  const pct = xpNeeded > 0 ? Math.min(xp / xpNeeded, 1) : 0;
  const filled = Math.round(pct * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `\`#${rank}\``;
}

export async function buildLeaderboardEmbed(interaction, client, allEntries, page) {
  const totalPages = Math.max(1, Math.ceil(allEntries.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const pageEntries = allEntries.slice(start, start + PAGE_SIZE);

  const lines = await Promise.all(
    pageEntries.map(async (entry, i) => {
      const rank = start + i + 1;
      const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      const display = member?.displayName ?? entry.username ?? `<@${entry.userId}>`;
      const xpNeeded = getXpForLevel(entry.level + 1);
      const bar = progressBar(entry.xp, xpNeeded);
      return (
        `${rankMedal(rank)} **${display}**\n` +
        `\` Lv.${entry.level} \` ${bar} \`${entry.xp}/${xpNeeded} XP\``
      );
    })
  );

  let callerFooter = '';
  const callerEntry = allEntries.find((e) => e.userId === interaction.user.id);
  if (callerEntry) {
    const callerRank = allEntries.indexOf(callerEntry) + 1;
    const onPage = callerRank > start && callerRank <= start + PAGE_SIZE;
    if (!onPage) {
      const xpNeeded = getXpForLevel(callerEntry.level + 1);
      callerFooter = `\n\n**Your rank:** ${rankMedal(callerRank)} Lv.${callerEntry.level} — ${callerEntry.xp}/${xpNeeded} XP`;
    }
  } else {
    callerFooter = '\n\n*You haven\'t earned any XP yet — start chatting!*';
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${interaction.guild.name} — Level Leaderboard`)
    .setColor('#2ecc71')
    .setDescription(lines.join('\n\n') + callerFooter)
    .setFooter({ text: `Page ${safePage} of ${totalPages} • ${allEntries.length} ranked members` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_prev:${safePage}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`lb_next:${safePage}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages),
  );

  return { embed, row, safePage, totalPages };
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number to jump to (default: 1)')
        .setMinValue(1)
        .setRequired(false)
    ),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);
      if (!levelingConfig?.enabled) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('The leveling system is currently disabled on this server.'),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const allEntries = await getLeaderboard(client, interaction.guildId, 100);

      if (allEntries.length === 0) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('No XP data yet — start chatting to earn XP and appear on the leaderboard!'),
          ],
        });
        return;
      }

      const page = interaction.options.getInteger('page') ?? 1;
      const { embed, row, safePage, totalPages } = await buildLeaderboardEmbed(interaction, client, allEntries, page);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: totalPages > 1 ? [row] : [],
      });

      logger.debug(`Leaderboard page ${safePage}/${totalPages} shown in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Leaderboard command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'leaderboard',
      });
    }
  },
};
