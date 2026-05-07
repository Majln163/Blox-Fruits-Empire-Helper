import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DURATION_CHOICES = [
    { name: 'Off (disable slowmode)', value: 0 },
    { name: '5 seconds', value: 5 },
    { name: '10 seconds', value: 10 },
    { name: '30 seconds', value: 30 },
    { name: '1 minute', value: 60 },
    { name: '2 minutes', value: 120 },
    { name: '5 minutes', value: 300 },
    { name: '10 minutes', value: 600 },
    { name: '30 minutes', value: 1800 },
    { name: '1 hour', value: 3600 },
    { name: '6 hours (max)', value: 21600 },
];

function formatSeconds(s) {
    if (s === 0) return 'Off';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set or clear slowmode on a channel.')
        .addIntegerOption(opt =>
            opt.setName('duration')
                .setDescription('Slowmode delay — choose a preset or check current if omitted')
                .addChoices(...DURATION_CHOICES)
        )
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel to apply slowmode to (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason (shown in audit log)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const duration = interaction.options.getInteger('duration');
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!channel.isTextBased()) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Slowmode can only be set on text-based channels.')]
                });
            }

            const me = interaction.guild.members.me;
            if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`I don't have **Manage Channel** permission in ${channel}.`)]
                });
            }

            if (duration === null) {
                const current = channel.rateLimitPerUser ?? 0;
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed(
                        `${channel} — current slowmode: **${current === 0 ? 'Off' : formatSeconds(current)}**`,
                        '⏱️ Slowmode Status'
                    )]
                });
            }

            const oldDelay = channel.rateLimitPerUser ?? 0;
            await channel.setRateLimitPerUser(duration, `${interaction.user.tag}: ${reason}`);

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: duration === 0 ? 'Slowmode Disabled' : 'Slowmode Set',
                    target: `${channel.name} (${channel.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        channel: channel.toString(),
                        previous: formatSeconds(oldDelay),
                        new: formatSeconds(duration),
                        moderatorId: interaction.user.id,
                    }
                }
            });

            if (duration === 0) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `⏱️ Slowmode disabled in ${channel}`,
                        `**Reason:** ${reason}`
                    )]
                });
            } else {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `⏱️ Slowmode set to **${formatSeconds(duration)}** in ${channel}`,
                        `Users must wait **${formatSeconds(duration)}** between messages.\n**Reason:** ${reason}`
                    )]
                });
            }

        } catch (error) {
            logger.error('Slowmode command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('An unexpected error occurred. Check that I have **Manage Channel** permission.')]
            });
        }
    }
};
