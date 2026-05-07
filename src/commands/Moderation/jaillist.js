import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb } from '../../utils/database.js';
import { getColor } from '../../config/bot.js';

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('jaillist')
        .setDescription('Show all currently jailed members in this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const prefix = `jail:${interaction.guildId}:`;
            let keys = [];

            if (client.db && typeof client.db.list === 'function') {
                const result = await client.db.list(prefix);
                if (Array.isArray(result)) {
                    keys = result;
                } else if (result && typeof result === 'object') {
                    keys = Object.keys(result).filter(k => k.startsWith(prefix));
                }
            }

            if (keys.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('🔓 No Jailed Members')
                            .setDescription('There are no members currently jailed in this server.')
                            .setTimestamp()
                    ]
                });
            }

            const entries = [];
            const now = Date.now();

            await Promise.all(
                keys.map(async (key) => {
                    const userId = key.replace(prefix, '');
                    const data = await getFromDb(key, null);
                    if (!data) return;

                    const jailedAt = data.jailedAt ? new Date(data.jailedAt).getTime() : null;
                    const duration = jailedAt ? formatDuration(now - jailedAt) : 'Unknown';

                    let moderator = 'Unknown';
                    if (data.moderatorId) {
                        const mod = await interaction.guild.members.fetch(data.moderatorId).catch(() => null);
                        moderator = mod ? mod.user.tag : `<@${data.moderatorId}>`;
                    }

                    entries.push({ userId, data, duration, jailedAt: jailedAt ?? 0, moderator });
                })
            );

            entries.sort((a, b) => b.jailedAt - a.jailedAt);

            const embed = new EmbedBuilder()
                .setColor(getColor('error'))
                .setTitle(`🔒 Jailed Members — ${interaction.guild.name}`)
                .setFooter({ text: `${entries.length} member${entries.length === 1 ? '' : 's'} currently jailed` })
                .setTimestamp();

            const CHUNK = 10;
            const shown = entries.slice(0, CHUNK);
            const fields = shown.map((e, i) => ({
                name: `${i + 1}. <@${e.userId}> (${e.userId})`,
                value: [
                    `**Duration:** ${e.duration}`,
                    `**Reason:** ${e.data.reason || 'No reason provided'}`,
                    `**Jailed by:** ${e.moderator}`,
                ].join('\n'),
                inline: false,
            }));

            if (fields.length === 0) {
                embed.setDescription('No active jail records found.');
            } else {
                embed.addFields(fields);
                if (entries.length > CHUNK) {
                    embed.setDescription(`Showing ${CHUNK} of ${entries.length} jailed members (most recent first).`);
                }
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('Jaillist command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('An unexpected error occurred while fetching the jail list.')]
            });
        }
    }
};
