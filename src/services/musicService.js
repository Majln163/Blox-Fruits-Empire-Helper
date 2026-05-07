import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
    NoSubscriberBehavior,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { logger } from '../utils/logger.js';

const queues = new Map();

export function getQueue(guildId) {
    return queues.get(guildId) ?? null;
}

export function createQueue(guild, voiceChannel, textChannel) {
    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    const queue = {
        guild,
        voiceChannel,
        textChannel,
        tracks: [],
        player,
        connection: null,
        volume: 80,
        loop: false,
    };
    queues.set(guild.id, queue);
    return queue;
}

export function destroyQueue(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;
    try { queue.connection?.destroy(); } catch {}
    queue.player.stop(true);
    queues.delete(guildId);
}

async function connectToChannel(queue) {
    const connection = joinVoiceChannel({
        channelId: queue.voiceChannel.id,
        guildId: queue.guild.id,
        adapterCreator: queue.guild.voiceAdapterCreator,
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
        connection.destroy();
        throw new Error('Could not connect to voice channel in time.');
    }

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            destroyQueue(queue.guild.id);
        }
    });

    connection.subscribe(queue.player);
    queue.connection = connection;
    return connection;
}

export async function playTrack(queue, track) {
    try {
        const streamData = await playdl.stream(track.url, { quality: 2 });
        const resource = createAudioResource(streamData.stream, {
            inputType: streamData.type,
            inlineVolume: true,
        });
        resource.volume?.setVolume(queue.volume / 100);
        queue.player.play(resource);
        queue.currentResource = resource;
    } catch (err) {
        logger.error(`Failed to stream track "${track.title}":`, err);
        throw err;
    }
}

export async function processQueue(queue) {
    if (queue.tracks.length === 0) {
        setTimeout(() => {
            if (queues.has(queue.guild.id) && queue.tracks.length === 0) {
                queue.textChannel?.send('📭 Queue finished — leaving voice channel.').catch(() => null);
                destroyQueue(queue.guild.id);
            }
        }, 30_000);
        return;
    }

    const track = queue.tracks[0];

    try {
        if (!queue.connection) {
            await connectToChannel(queue);
        }

        await playTrack(queue, track);

        queue.player.once(AudioPlayerStatus.Idle, () => {
            if (!queues.has(queue.guild.id)) return;
            if (!queue.loop) queue.tracks.shift();
            processQueue(queue);
        });

        queue.player.once('error', (err) => {
            logger.error('Audio player error:', err);
            queue.tracks.shift();
            processQueue(queue);
        });

    } catch (err) {
        logger.error('processQueue error:', err);
        queue.tracks.shift();
        processQueue(queue);
    }
}

export async function searchTrack(query) {
    try {
        const isUrl = /^https?:\/\//i.test(query);

        if (isUrl) {
            if (playdl.yt_validate(query) === 'video') {
                const info = await playdl.video_info(query);
                return [{
                    title: info.video_details.title,
                    url: info.video_details.url,
                    duration: formatDuration(info.video_details.durationInSec),
                    durationSec: info.video_details.durationInSec,
                    thumbnail: info.video_details.thumbnails?.[0]?.url,
                }];
            }
        }

        const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 5 });
        return results.map(v => ({
            title: v.title,
            url: v.url,
            duration: formatDuration(v.durationInSec),
            durationSec: v.durationInSec,
            thumbnail: v.thumbnails?.[0]?.url,
        }));
    } catch (err) {
        logger.error('searchTrack error:', err);
        throw err;
    }
}

export function formatDuration(sec) {
    if (!sec || isNaN(sec)) return 'Live';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
