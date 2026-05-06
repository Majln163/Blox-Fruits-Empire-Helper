import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
  getInviteData,
  currentInvites,
  adjustBonusInvites,
  resetInviteData,
  getLeaderboard,
} from '../../services/inviteService.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function rankMedal(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`#${i + 1}\``;
}

export default {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite tracking commands')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check how many invites you or another member has')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Member to check (default: yourself)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('leaderboard').setDescription('Show the top inviters in this server')
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('(Admin) Add bonus invites to a member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Member to add invites to').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Number of invites to add').setMinValue(1).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('(Admin) Remove bonus invites from a member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Member to remove invites from').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Number of invites to remove').setMinValue(1).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('(Admin) Reset all invite data for a member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Member to reset').setRequired(true)
        )
    ),

  category: 'Invites',

  async execute(interaction, config, client) {
    try {
      const sub = interaction.options.getSubcommand();
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

      if (['add', 'remove', 'reset'].includes(sub) && !isAdmin) {
        await interaction.reply({
          embeds: [errorEmbed('You need the **Manage Server** permission to use this subcommand.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === 'check') {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const target = interaction.options.getUser('user') ?? interaction.user;
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        const data = await getInviteData(client, interaction.guildId, target.id);
        const current = currentInvites(data);

        const embed = createEmbed({
          title: `📨 Invites — ${member?.displayName ?? target.username}`,
          color: 'primary',
          thumbnail: target.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '✅ Active Invites', value: `**${current}**`, inline: true },
            { name: '📥 Total Joined', value: `**${data.total}**`, inline: true },
            { name: '🚪 Left Server', value: `**${data.left}**`, inline: true },
            ...(data.bonus > 0
              ? [{ name: '🎁 Bonus', value: `**${data.bonus}**`, inline: true }]
              : []),
          ],
          footer: { text: 'Active = Total Joined − Left + Bonus' },
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (sub === 'leaderboard') {
        await InteractionHelper.safeDefer(interaction);

        const entries = await getLeaderboard(client, interaction.guildId, 10);

        if (entries.length === 0) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              createEmbed({
                title: '📨 Invite Leaderboard',
                description: 'No invite data yet — share your invite link to get started!',
                color: 'primary',
              }),
            ],
          });
        }

        const lines = await Promise.all(
          entries.map(async (entry, i) => {
            const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
            const display = member?.displayName ?? `<@${entry.userId}>`;
            return (
              `${rankMedal(i)} **${display}**\n` +
              `\`${entry.current} active\` • ${entry.total} joined • ${entry.left} left`
            );
          })
        );

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle(`📨 ${interaction.guild.name} — Invite Leaderboard`)
              .setColor('#5865f2')
              .setDescription(lines.join('\n\n'))
              .setFooter({ text: 'Active = Total Joined − Left + Bonus' })
              .setTimestamp(),
          ],
        });
      }

      if (sub === 'add') {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        const data = await adjustBonusInvites(client, interaction.guildId, target.id, amount);
        logger.info(`Admin ${interaction.user.id} added ${amount} bonus invites to ${target.id} in ${interaction.guildId}`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '✅ Bonus Invites Added',
              description: `Added **${amount}** bonus invite${amount !== 1 ? 's' : ''} to <@${target.id}>.\nThey now have **${currentInvites(data)}** active invite${currentInvites(data) !== 1 ? 's' : ''}.`,
              color: 'success',
            }),
          ],
        });
      }

      if (sub === 'remove') {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        const data = await adjustBonusInvites(client, interaction.guildId, target.id, -amount);
        logger.info(`Admin ${interaction.user.id} removed ${amount} bonus invites from ${target.id} in ${interaction.guildId}`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '✅ Bonus Invites Removed',
              description: `Removed **${amount}** bonus invite${amount !== 1 ? 's' : ''} from <@${target.id}>.\nThey now have **${currentInvites(data)}** active invite${currentInvites(data) !== 1 ? 's' : ''}.`,
              color: 'warning',
            }),
          ],
        });
      }

      if (sub === 'reset') {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('user');

        await resetInviteData(client, interaction.guildId, target.id);
        logger.info(`Admin ${interaction.user.id} reset invite data for ${target.id} in ${interaction.guildId}`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '🗑️ Invite Data Reset',
              description: `All invite data for <@${target.id}> has been reset to zero.`,
              color: 'error',
            }),
          ],
        });
      }
    } catch (error) {
      logger.error('Invites command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'invites',
      });
    }
  },
};
