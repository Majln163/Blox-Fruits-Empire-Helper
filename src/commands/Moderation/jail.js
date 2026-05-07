import { SlashCommandBuilder, PermissionFlagsBits, OverwriteType, ChannelType, EmbedBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logModerationAction, generateCaseId } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { getColor } from '../../config/bot.js';
import { parseDuration, formatDuration } from '../../services/jailService.js';

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
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Auto-release after this time (e.g. 30m, 2h, 1d). Leave blank for permanent.')
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
            const durationStr = interaction.options.getString('duration');

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

            let durationMs = null;
            if (durationStr) {
                durationMs = parseDuration(durationStr);
                if (!durationMs) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            'Invalid duration format. Use combinations like `30m`, `2h`, `1d`, `1d12h30m`.'
                        )]
                    });
                }
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

            const jailCfg = await getFromDb(`jailconfig:${interaction.guildId}`, {});
            const jailChannelId = jailCfg?.channelId || null;
            const jailChannel = jailChannelId ? interaction.guild.channels.cache.get(jailChannelId) : null;

            const savedRoleIds = member.roles.cache
                .filter(r => r.id !== interaction.guild.id && r.id !== jailRole.id)
                .map(r => r.id);

            const expiresAt = durationMs ? new Date(Date.now() + durationMs).toISOString() : null;

            await setInDb(jailKey, {
                roles: savedRoleIds,
                jailedAt: new Date().toISOString(),
                expiresAt,
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

            if (jailChannel) {
                await jailChannel.permissionOverwrites.edit(targetUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AddReactions: false,
                }, { reason: auditReason, type: OverwriteType.Member });

                const notifyEmbed = new EmbedBuilder()
                    .setColor(getColor('error'))
                    .setTitle('🔒 You have been jailed')
                    .setDescription(
                        `${targetUser}, you have been jailed in **${interaction.guild.name}**.\n\n` +
                        `**Reason:** ${reason}\n` +
                        (durationMs
                            ? `**Duration:** ${formatDuration(durationMs)} — you will be released automatically.\n`
                            : `**Duration:** Permanent until a moderator releases you.\n`) +
                        `\nContact a moderator here if you believe this is a mistake.`
                    )
                    .addFields({ name: 'Moderated by', value: `${interaction.user}`, inline: true })
                    .setTimestamp();

                await jailChannel.send({ content: `${targetUser}`, embeds: [notifyEmbed] }).catch(() => null);
            }

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
                        duration: durationMs ? formatDuration(durationMs) : 'Permanent',
                        rolesRemoved: savedRoleIds.length,
                        channelsLocked: channels.size,
                        jailChannel: jailChannel ? `#${jailChannel.name}` : 'not configured',
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                    }
                }
            });

            const lines = [
                `**Reason:** ${reason}`,
                `**Duration:** ${durationMs ? formatDuration(durationMs) + ' (auto-release enabled)' : 'Permanent'}`,
                `**Roles saved:** ${savedRoleIds.length}`,
                `**Channels locked:** ${channels.size}`,
                jailChannel ? `**Jail channel:** ${jailChannel}` : `**Jail channel:** not set — use \`/jailsetup channel\` to configure one`,
                `**Case ID:** #${caseId}`,
            ].join('\n');

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(`🔒 **Jailed** ${targetUser.tag}`, lines)]
            });

        } catch (error) {
            logger.error('Jail command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || 'An unexpected error occurred while jailing the user.')]
            });
        }
    }
};
