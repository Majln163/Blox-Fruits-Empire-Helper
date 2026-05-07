import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';
import {
    getQueue, createQueue, destroyQueue,
    searchTrack, processQueue, formatDuration,
} from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player commands.')
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('Play a song or add it to the queue.')
                .addStringOption(opt =>
                    opt.setName('query').setDescription('Song name or YouTube URL').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('Stop playback and clear the queue.')
        )
        .addSubcommand(sub =>
            sub.setName('skip')
                .setDescription('Skip the current song.')
        )
        .addSubcommand(sub =>
            sub.setName('pause')
                .setDescription('Pause the current song.')
        )
        .addSubcommand(sub =>
            sub.setName('resume')
                .setDescription('Resume playback.')
        )
        .addSubcommand(sub =>
            sub.setName('queue')
                .setDescription('Show the current song queue.')
        )
        .addSubcommand(sub =>
            sub.setName('nowplaying')
                .setDescription('Show the currently playing song.')
        )
        .addSubcommand(sub =>
            sub.setName('volume')
                .setDescription('Set the playback volume (0–100).')
                .addIntegerOption(opt =>
                    opt.setName('level').setDescription('Volume level (0–100)').setRequired(true).setMinValue(0).setMaxValue(100)
                )
        )
        .addSubcommand(sub =>
            sub.setName('loop')
                .setDescription('Toggle loop for the current song.')
        )
        .addSubcommand(sub =>
            sub.setName('leave')
                .setDescription('Disconnect the bot from the voice channel.')
        ),
    category: 'music',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const sub = interaction.options.getSubcommand();
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        try {
            if (sub === 'play') {
                if (!voiceChannel) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('You need to be in a voice channel to play music.')]
                    });
                }

                const query = interaction.options.getString('query');
                let results;
                try {
                    results = await searchTrack(query);
                } catch (err) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(`Could not find that song. Try a more specific search or a direct YouTube URL.\n\`${err.message}\``)]
                    });
                }

                if (!results || results.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('No results found for that query.')]
                    });
                }

                const track = { ...results[0], requestedBy: interaction.user.tag };

                let queue = getQueue(interaction.guildId);
                const wasEmpty = !queue || queue.tracks.length === 0;

                if (!queue) {
                    queue = createQueue(interaction.guild, voiceChannel, interaction.channel);
                } else if (queue.voiceChannel.id !== voiceChannel.id) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(`I'm already playing in ${queue.voiceChannel}. Join that channel or use \`/music stop\` first.`)]
                    });
                }

                queue.tracks.push(track);

                if (wasEmpty) {
                    try {
                        await processQueue(queue);
                    } catch (err) {
                        destroyQueue(interaction.guildId);
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(`Failed to start playback: ${err.message}`)]
                        });
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('primary'))
                    .setTitle(wasEmpty ? '▶️ Now Playing' : '➕ Added to Queue')
                    .setDescription(`**[${track.title}](${track.url})**`)
                    .addFields(
                        { name: 'Duration', value: track.duration, inline: true },
                        { name: 'Requested by', value: track.requestedBy, inline: true },
                        { name: 'Position', value: wasEmpty ? 'Now playing' : `#${queue.tracks.length}`, inline: true }
                    )
                    .setTimestamp();

                if (track.thumbnail) embed.setThumbnail(track.thumbnail);

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            const queue = getQueue(interaction.guildId);

            if (sub === 'stop') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                destroyQueue(interaction.guildId);
                return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('⏹️ Stopped and cleared the queue.')] });
            }

            if (sub === 'leave') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('I\'m not in a voice channel.')] });
                destroyQueue(interaction.guildId);
                return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('👋 Left the voice channel.')] });
            }

            if (sub === 'skip') {
                if (!queue || queue.tracks.length === 0) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                const skipped = queue.tracks[0];
                queue.player.stop();
                return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`⏭️ Skipped **${skipped.title}**`)] });
            }

            if (sub === 'pause') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                if (queue.player.state.status === 'paused') {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Already paused. Use `/music resume` to continue.')] });
                }
                queue.player.pause();
                return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('⏸️ Paused.')] });
            }

            if (sub === 'resume') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                if (queue.player.state.status !== 'paused') {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Not paused.')] });
                }
                queue.player.unpause();
                return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('▶️ Resumed.')] });
            }

            if (sub === 'loop') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                queue.loop = !queue.loop;
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(queue.loop ? '🔂 Loop enabled — current song will repeat.' : '➡️ Loop disabled.')]
                });
            }

            if (sub === 'volume') {
                if (!queue) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is playing.')] });
                const level = interaction.options.getInteger('level');
                queue.volume = level;
                if (queue.currentResource?.volume) {
                    queue.currentResource.volume.setVolume(level / 100);
                }
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`🔊 Volume set to **${level}%**`)]
                });
            }

            if (sub === 'nowplaying') {
                if (!queue || queue.tracks.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Nothing is currently playing.')] });
                }
                const track = queue.tracks[0];
                const embed = new EmbedBuilder()
                    .setColor(getColor('primary'))
                    .setTitle('🎵 Now Playing')
                    .setDescription(`**[${track.title}](${track.url})**`)
                    .addFields(
                        { name: 'Duration', value: track.duration, inline: true },
                        { name: 'Requested by', value: track.requestedBy, inline: true },
                        { name: 'Volume', value: `${queue.volume}%`, inline: true },
                        { name: 'Loop', value: queue.loop ? '🔂 On' : '➡️ Off', inline: true },
                    )
                    .setTimestamp();
                if (track.thumbnail) embed.setThumbnail(track.thumbnail);
                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'queue') {
                if (!queue || queue.tracks.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [infoEmbed('The queue is empty.', '📋 Queue')] });
                }
                const tracks = queue.tracks;
                const totalSec = tracks.reduce((a, t) => a + (t.durationSec ?? 0), 0);
                const lines = tracks.slice(0, 15).map((t, i) =>
                    `${i === 0 ? '▶️' : `${i + 1}.`} **[${t.title}](${t.url})** — \`${t.duration}\` — ${t.requestedBy}`
                );
                if (tracks.length > 15) lines.push(`\n*...and ${tracks.length - 15} more*`);
                const embed = new EmbedBuilder()
                    .setColor(getColor('primary'))
                    .setTitle(`📋 Queue — ${tracks.length} track${tracks.length === 1 ? '' : 's'}`)
                    .setDescription(lines.join('\n'))
                    .setFooter({ text: `Total duration: ${formatDuration(totalSec)} • Volume: ${queue.volume}% • Loop: ${queue.loop ? 'On' : 'Off'}` })
                    .setTimestamp();
                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

        } catch (error) {
            logger.error(`Music command error (${sub}):`, error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`An error occurred: ${error.message}`)]
            });
        }
    }
};
