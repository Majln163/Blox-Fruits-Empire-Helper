import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb } from '../../utils/database.js';
import { unjailMember } from '../../services/jailService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Release a jailed user: restore their roles and channel access.')
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

            const result = await unjailMember({
                client,
                guild: interaction.guild,
                userId: targetUser.id,
                reason,
                executorTag: `${interaction.user.tag} (manual)`,
            });

            if (!result) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Failed to unjail — the member may have already left the server.')]
                });
            }

            const description = [
                `**Reason:** ${reason}`,
                `**Roles restored:** ${result.restored.length}`,
                result.failed.length > 0 ? `**Could not restore:** ${result.failed.join(', ')} (deleted or above bot)` : null,
                `**Channels unlocked:** ${result.channelsUnlocked}`,
                `**Case ID:** #${result.caseId}`,
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
