import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getLeaderboard, getLevelingConfig } from '../../services/leveling.js';
import { buildLeaderboardEmbed } from '../../commands/Leveling/leaderboard.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

async function handlePageButton(interaction, client, args, direction) {
  try {
    await interaction.deferUpdate();

    const currentPage = parseInt(args[0], 10) || 1;
    const nextPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('The leveling system is currently disabled.'),
        ],
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allEntries = await getLeaderboard(client, interaction.guildId, 100);
    const { embed, row, safePage, totalPages } = await buildLeaderboardEmbed(
      interaction,
      client,
      allEntries,
      nextPage
    );

    await interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });

    logger.debug(`Leaderboard navigated to page ${safePage}/${totalPages} in guild ${interaction.guildId}`);
  } catch (error) {
    logger.error('Leaderboard button error:', error);
    await handleInteractionError(interaction, error, {
      type: 'button',
      customId: interaction.customId,
    });
  }
}

export default [
  {
    name: 'lb_prev',
    execute: (interaction, client, args) => handlePageButton(interaction, client, args, 'prev'),
  },
  {
    name: 'lb_next',
    execute: (interaction, client, args) => handlePageButton(interaction, client, args, 'next'),
  },
];
