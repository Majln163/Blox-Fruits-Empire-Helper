import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';

function jailConfigKey(guildId) {
    return `jailconfig:${guildId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('jailsetup')
        .setDescription('Configure the jail system.')
        .addSubcommand(sub =>
            sub.setName('channel')
                .setDescription('Set the channel where jailed users can appeal to mods.')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('The jail appeal channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove the configured jail channel.')
        )
        .addSubcommand(sub =>
            sub.setName('dashboard')
                .setDescription('Show the current jail channel configuration.')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const sub = interaction.options.getSubcommand();
        const key = jailConfigKey(interaction.guildId);

        try {
            if (sub === 'channel') {
                const channel = interaction.options.getChannel('channel');

                const me = interaction.guild.members.me;
                const perms = channel.permissionsFor(me);
                if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels])) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(
                            `I need **View Channel**, **Send Messages**, and **Manage Channel** permissions in ${channel} to use it as a jail channel.`
                        )]
                    });
                }

                const existing = await getFromDb(key, {});
                await setInDb(key, { ...existing, channelId: channel.id });

                const jailRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'jail');

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        '🔒 Jail Channel Set',
                        [
                            `Jailed users will now be able to see and type in ${channel}.`,
                            jailRole
                                ? `\nMake sure ${channel} denies **View Channel** for \`@everyone\` so only jailed users see it.`
                                : `\n⚠️ No **Jail** role found — create a role named \`Jail\` so the jail system works fully.`,
                        ].join('')
                    )]
                });

            } else if (sub === 'remove') {
                const existing = await getFromDb(key, {});
                if (!existing?.channelId) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('No jail channel is currently configured.')]
                    });
                }
                delete existing.channelId;
                await setInDb(key, existing);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Jail channel removed.', 'Jailed users will no longer have access to any channel.')]
                });

            } else if (sub === 'dashboard') {
                const cfg = await getFromDb(key, {});
                const jailRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'jail');
                const jailChannel = cfg?.channelId ? interaction.guild.channels.cache.get(cfg.channelId) : null;

                const lines = [
                    `**Jail Role:** ${jailRole ? `${jailRole} ✅` : '❌ Not found — create a role named `Jail`'}`,
                    `**Jail Channel:** ${jailChannel ? `${jailChannel} ✅` : '❌ Not set — use `/jailsetup channel` to configure'}`,
                ];

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed(lines.join('\n'), '🔒 Jail System Dashboard')]
                });
            }

        } catch (error) {
            logger.error('Jailsetup command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('An unexpected error occurred.')]
            });
        }
    }
};
