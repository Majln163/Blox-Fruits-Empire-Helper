import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rolereward')
    .setDescription('Manage level-based role rewards')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Award a role when members reach a specific level')
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('The level that triggers this role reward')
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('The role to award')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove the role reward for a specific level')
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('The level whose reward to remove')
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all configured level role rewards')
    )
    .addSubcommand((sub) =>
      sub
        .setName('sync')
        .setDescription('Scan all members and assign any role rewards they\'ve already earned')
    ),

  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);

      if (!levelingConfig?.enabled) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('The leveling system is not enabled on this server. Use `/level setup` first.')],
        });
      }

      const subcommand = interaction.options.getSubcommand();
      const roleRewards = levelingConfig.roleRewards || {};

      if (subcommand === 'add') {
        const level = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');

        if (role.managed) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('That role is managed by an integration and cannot be used as a reward.')],
          });
        }

        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`I can't assign ${role} because it's higher than or equal to my highest role. Please move my role above it.`)],
          });
        }

        const existingRoleId = roleRewards[level];
        roleRewards[level] = role.id;

        await saveLevelingConfig(client, interaction.guildId, {
          ...levelingConfig,
          roleRewards,
        });

        const description = existingRoleId
          ? `Updated level **${level}** reward from <@&${existingRoleId}> → ${role}.`
          : `Members who reach level **${level}** will now automatically receive ${role}.`;

        logger.info(`Role reward set: level ${level} → ${role.id} in guild ${interaction.guildId}`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '✅ Role Reward Set',
              description,
              color: 'success',
              fields: [
                { name: 'Level', value: `**${level}**`, inline: true },
                { name: 'Role', value: `${role}`, inline: true },
              ],
            }),
          ],
        });
      }

      if (subcommand === 'remove') {
        const level = interaction.options.getInteger('level');

        if (!roleRewards[level]) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`There is no role reward configured for level **${level}**.`)],
          });
        }

        const removedRoleId = roleRewards[level];
        delete roleRewards[level];

        await saveLevelingConfig(client, interaction.guildId, {
          ...levelingConfig,
          roleRewards,
        });

        logger.info(`Role reward removed: level ${level} in guild ${interaction.guildId}`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '🗑️ Role Reward Removed',
              description: `The role reward for level **${level}** (<@&${removedRoleId}>) has been removed. Members who already have the role will keep it.`,
              color: 'warning',
            }),
          ],
        });
      }

      if (subcommand === 'list') {
        const entries = Object.entries(roleRewards)
          .map(([lvl, roleId]) => ({ level: parseInt(lvl, 10), roleId }))
          .sort((a, b) => a.level - b.level);

        if (entries.length === 0) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              createEmbed({
                title: '🎖️ Level Role Rewards',
                description: 'No role rewards configured yet.\n\nUse `/rolereward add` to set one up.',
                color: 'primary',
              }),
            ],
          });
        }

        const lines = entries.map(({ level, roleId }) => {
          const role = interaction.guild.roles.cache.get(roleId);
          const roleDisplay = role ? `${role}` : `~~<@&${roleId}>~~ *(deleted)*`;
          return `**Level ${level}** → ${roleDisplay}`;
        });

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '🎖️ Level Role Rewards',
              description: lines.join('\n'),
              color: 'primary',
              footer: { text: `${entries.length} reward${entries.length !== 1 ? 's' : ''} configured` },
            }),
          ],
        });
      }

      if (subcommand === 'sync') {
        const entries = Object.entries(roleRewards).map(([lvl, roleId]) => ({
          level: parseInt(lvl, 10),
          roleId,
        }));

        if (entries.length === 0) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('No role rewards are configured. Use `/rolereward add` first.')],
          });
        }

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('⏳ Scanning all members and awarding missing roles… this may take a moment.'),
          ],
        });

        const { getUserLevelData } = await import('../../services/leveling.js');

        let awarded = 0;
        let skipped = 0;
        let errors = 0;

        const members = await interaction.guild.members.fetch().catch(() => new Map());
        const botMember = interaction.guild.members.me;

        for (const [, member] of members) {
          if (member.user.bot) continue;

          try {
            const userData = await getUserLevelData(client, interaction.guildId, member.id);
            if (!userData || userData.level === 0) { skipped++; continue; }

            for (const { level, roleId } of entries) {
              if (userData.level < level) continue;

              const role = interaction.guild.roles.cache.get(roleId);
              if (!role) continue;
              if (role.position >= botMember.roles.highest.position) continue;
              if (member.roles.cache.has(roleId)) continue;

              await member.roles.add(role, `Role reward sync — reached level ${level}`);
              awarded++;
            }
          } catch (err) {
            logger.warn(`Sync error for member ${member.id}: ${err.message}`);
            errors++;
          }
        }

        logger.info(`Role reward sync complete in guild ${interaction.guildId}: ${awarded} awarded, ${skipped} skipped, ${errors} errors`);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '✅ Role Reward Sync Complete',
              description: `All members have been scanned and any missing role rewards have been assigned.`,
              color: 'success',
              fields: [
                { name: '🎖️ Roles Awarded', value: `**${awarded}**`, inline: true },
                { name: '⏭️ Already Had Role', value: `**${skipped}**`, inline: true },
                { name: '⚠️ Errors', value: `**${errors}**`, inline: true },
              ],
            }),
          ],
        });
      }
    } catch (error) {
      logger.error('Rolereward command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'rolereward',
      });
    }
  },
};
