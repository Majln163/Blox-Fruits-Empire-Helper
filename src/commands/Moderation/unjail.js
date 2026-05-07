import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction, generateCaseId } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, deleteFromDb } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Release a jailed user and restore their previous roles.')
        .addUserOption(option =>
            option.setName('target').setDescription('The user to unjail').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Reason for unjailing')
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

            if (!member.manageable) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('I cannot manage this user. They may have a higher role than me.')]
                });
            }

            const jailKey = `jail:${interaction.guildId}:${targetUser.id}`;
            const jailData = await getFromDb(jailKey, null);

            if (!jailData) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`${targetUser.tag} is not currently jailed.`)]
                });
            }

            const jailRole = interaction.guild.roles.cache.find(
                r => r.name.toLowerCase() === 'jail'
            );

            if (jailRole && member.roles.cache.has(jailRole.id)) {
                await member.roles.remove(jailRole, `Unjailed by ${interaction.user.tag}: ${reason}`);
            }

            const roleIds = jailData.roles || [];
            const restored = [];
            const failed = [];

            for (const roleId of roleIds) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    failed.push(roleId);
                    continue;
                }
                if (!role.manageable) {
                    failed.push(role.name);
                    continue;
                }
                try {
                    await member.roles.add(role, `Unjailed by ${interaction.user.tag}: ${reason}`);
                    restored.push(role.name);
                } catch {
                    failed.push(role.name);
                }
            }

            await deleteFromDb(jailKey);

            const caseId = await generateCaseId(client, interaction.guildId);

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Member Unjailed',
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    caseId,
                    metadata: {
                        rolesRestored: restored.length,
                        rolesFailed: failed.length,
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                    }
                }
            });

            const description = [
                `**Reason:** ${reason}`,
                `**Roles restored:** ${restored.length}`,
                failed.length > 0 ? `**Could not restore:** ${failed.join(', ')} (deleted or too high)` : null,
                `**Case ID:** #${caseId}`,
            ].filter(Boolean).join('\n');

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(`🔓 **Unjailed** ${targetUser.tag}`, description)]
            });

        } catch (error) {
            logger.error('Unjail command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || 'An unexpected error occurred while unjailing the user.')]
            });
        }
    }
};
