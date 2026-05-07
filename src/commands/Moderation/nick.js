import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change or reset a member\'s nickname.')
        .addUserOption(opt =>
            opt.setName('target').setDescription('The member to rename').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('nickname')
                .setDescription('New nickname (leave blank to reset to their username)')
                .setMaxLength(32)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason (shown in audit log)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const targetUser = interaction.options.getUser('target');
            const member = interaction.options.getMember('target');
            const nickname = interaction.options.getString('nickname') ?? null;
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!member) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('That user is not in this server.')]
                });
            }

            if (!member.manageable) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('I cannot change this user\'s nickname — they may have a higher role than me.')]
                });
            }

            const oldNick = member.nickname ?? member.user.username;
            const auditReason = `${interaction.user.tag}: ${reason}`;

            await member.setNickname(nickname, auditReason);

            const newDisplay = nickname ?? member.user.username;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: nickname ? 'Nickname Changed' : 'Nickname Reset',
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        before: oldNick,
                        after: newDisplay,
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                    }
                }
            });

            const description = nickname
                ? `**Before:** ${oldNick}\n**After:** ${nickname}\n**Reason:** ${reason}`
                : `Nickname for ${targetUser} has been reset to their username.\n**Before:** ${oldNick}\n**Reason:** ${reason}`;

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    nickname ? `✏️ Nickname changed for ${targetUser.tag}` : `✏️ Nickname reset for ${targetUser.tag}`,
                    description
                )]
            });

        } catch (error) {
            logger.error('Nick command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('An unexpected error occurred. Check I have the **Manage Nicknames** permission.')]
            });
        }
    }
};
