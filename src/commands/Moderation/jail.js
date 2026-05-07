import { SlashCommandBuilder, PermissionFlagsBits, OverwriteType, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logModerationAction, generateCaseId } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const DENY_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Stream,
];

export default {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Jail a user: strip roles and lock them out of all channels.')
        .addUserOption(option =>
            option.setName('target').setDescription('The user to jail').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Reason for jailing')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const targetUser = interaction.options.getUser('target');
            const member = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!member) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('That user is not in this server.')]
                });
            }
            if (targetUser.id === interaction.user.id) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('You cannot jail yourself.')]
                });
            }
            if (targetUser.id === client.user.id) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('You cannot jail the bot.')]
                });
            }
            if (!member.manageable) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('I cannot manage this user. They may have a higher role than me.')]
                });
            }

            const jailKey = `jail:${interaction.guildId}:${targetUser.id}`;
            const existing = await getFromDb(jailKey, null);
            if (existing) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`${targetUser.tag} is already jailed. Use \`/unjail\` first.`)]
                });
            }

            const jailRole = interaction.guild.roles.cache.find(
                r => r.name.toLowerCase() === 'jail'
            );
            if (!jailRole) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'No **Jail** role found.\nCreate a role named exactly `Jail` in your server settings, then try again.'
                    )]
                });
            }

            const savedRoleIds = member.roles.cache
                .filter(r => r.id !== interaction.guild.id && r.id !== jailRole.id)
                .map(r => r.id);

            await setInDb(jailKey, {
                roles: savedRoleIds,
                jailedAt: new Date().toISOString(),
                reason,
                moderatorId: interaction.user.id,
            });

            const rolesToRemove = member.roles.cache.filter(
                r => r.id !== interaction.guild.id && r.manageable
            );
            if (rolesToRemove.size > 0) {
                await member.roles.remove([...rolesToRemove.keys()], `Jailed by ${interaction.user.tag}: ${reason}`);
            }

            await member.roles.add(jailRole, `Jailed by ${interaction.user.tag}: ${reason}`);

            const auditReason = `Jailed by ${interaction.user.tag}: ${reason}`;
            const channels = interaction.guild.channels.cache.filter(ch =>
                ch.type !== ChannelType.GuildCategory &&
                ch.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.ManageChannels)
            );

            await Promise.allSettled(
                channels.map(ch =>
                    ch.permissionOverwrites.edit(targetUser.id, {
                        ViewChannel: false,
                        SendMessages: false,
                        SendMessagesInThreads: false,
                        AddReactions: false,
                        Speak: false,
                        Connect: false,
                        Stream: false,
                    }, { reason: auditReason, type: OverwriteType.Member })
                )
            );

            const caseId = await generateCaseId(client, interaction.guildId);

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Member Jailed',
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    caseId,
                    metadata: {
                        rolesRemoved: savedRoleIds.length,
                        channelsLocked: channels.size,
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `🔒 **Jailed** ${targetUser.tag}`,
                    `**Reason:** ${reason}\n**Roles saved:** ${savedRoleIds.length}\n**Channels locked:** ${channels.size}\n**Case ID:** #${caseId}`
                )]
            });

        } catch (error) {
            logger.error('Jail command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || 'An unexpected error occurred while jailing the user.')]
            });
        }
    }
};
