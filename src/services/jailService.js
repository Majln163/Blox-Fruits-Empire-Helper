import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getFromDb, deleteFromDb } from '../utils/database.js';
import { logModerationAction, generateCaseId } from '../utils/moderation.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';

/**
 * Parse a duration string like "1h30m", "2d", "45m" into milliseconds.
 * Returns null if the string is invalid or zero.
 */
export function parseDuration(str) {
    if (!str) return null;
    const re = /(\d+)\s*(d|h|m)/gi;
    let ms = 0;
    let match;
    while ((match = re.exec(str)) !== null) {
        const n = parseInt(match[1], 10);
        switch (match[2].toLowerCase()) {
            case 'd': ms += n * 86400000; break;
            case 'h': ms += n * 3600000; break;
            case 'm': ms += n * 60000; break;
        }
    }
    return ms > 0 ? ms : null;
}

/**
 * Format milliseconds into a human-readable duration string.
 */
export function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.length > 0 ? parts.join(' ') : '< 1m';
}

/**
 * Core unjail logic shared between the /unjail command and the auto-expiry cron.
 * Returns { restored, failed, channelsUnlocked, caseId }
 */
export async function unjailMember({ client, guild, userId, reason = 'Jail expired', executorTag = 'AutoMod' }) {
    const jailKey = `jail:${guild.id}:${userId}`;
    const jailData = await getFromDb(jailKey, null);
    if (!jailData) return null;

    let member;
    try {
        member = await guild.members.fetch(userId);
    } catch {
        await deleteFromDb(jailKey);
        logger.info(`Jail record cleared for ${userId} in guild ${guild.id} — member left server`);
        return null;
    }

    const auditReason = `Unjailed by ${executorTag}: ${reason}`;

    const channels = guild.channels.cache.filter(ch =>
        ch.type !== ChannelType.GuildCategory &&
        ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageChannels)
    );

    await Promise.allSettled(
        channels.map(ch => {
            const overwrite = ch.permissionOverwrites.cache.get(userId);
            if (overwrite) return overwrite.delete(auditReason);
            return Promise.resolve();
        })
    );

    const jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jail');
    if (jailRole && member.roles.cache.has(jailRole.id)) {
        await member.roles.remove(jailRole, auditReason).catch(() => null);
    }

    const roleIds = jailData.roles || [];
    const restored = [];
    const failed = [];

    for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId);
        if (!role) { failed.push('(deleted role)'); continue; }
        if (!role.manageable) { failed.push(role.name); continue; }
        try {
            await member.roles.add(role, auditReason);
            restored.push(role.name);
        } catch {
            failed.push(role.name);
        }
    }

    await deleteFromDb(jailKey);

    const caseId = await generateCaseId(client, guild.id);
    await logModerationAction({
        client,
        guild,
        event: {
            action: 'Member Unjailed',
            target: `${member.user.tag} (${userId})`,
            executor: executorTag,
            reason,
            caseId,
            metadata: {
                rolesRestored: restored.length,
                rolesFailed: failed.length,
                channelsUnlocked: channels.size,
                userId,
            }
        }
    });

    return { member, restored, failed, channelsUnlocked: channels.size, caseId };
}

/**
 * Check all guilds for expired jail sentences and automatically release them.
 * Called by the cron job every minute.
 */
export async function checkExpiredJails(client) {
    if (!client.db || typeof client.db.list !== 'function') return;

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const prefix = `jail:${guildId}:`;
            let keys = await client.db.list(prefix);

            if (!Array.isArray(keys)) {
                if (keys && typeof keys === 'object') {
                    keys = Object.keys(keys).filter(k => k.startsWith(prefix));
                } else {
                    continue;
                }
            }

            for (const key of keys) {
                try {
                    const data = await getFromDb(key, null);
                    if (!data?.expiresAt) continue;

                    const expiresAt = new Date(data.expiresAt).getTime();
                    if (Date.now() < expiresAt) continue;

                    const userId = key.replace(prefix, '');
                    logger.info(`Auto-unjailing ${userId} in guild ${guildId} — sentence expired`);

                    const result = await unjailMember({
                        client,
                        guild,
                        userId,
                        reason: 'Jail sentence expired',
                        executorTag: 'AutoMod',
                    });

                    if (result) {
                        const jailCfg = await getFromDb(`jailconfig:${guildId}`, {});
                        const jailChannel = jailCfg?.channelId
                            ? guild.channels.cache.get(jailCfg.channelId)
                            : null;

                        if (jailChannel) {
                            const embed = new EmbedBuilder()
                                .setColor(getColor('success'))
                                .setTitle('🔓 Jail sentence served')
                                .setDescription(
                                    `${result.member} has been automatically released — their sentence has expired.\n\n` +
                                    `**Roles restored:** ${result.restored.length}\n` +
                                    `**Case ID:** #${result.caseId}`
                                )
                                .setTimestamp();
                            await jailChannel.send({ embeds: [embed] }).catch(() => null);
                        }
                    }
                } catch (err) {
                    logger.error(`Error auto-unjailing key ${key}:`, err);
                }
            }
        } catch (err) {
            logger.error(`Error checking expired jails for guild ${guildId}:`, err);
        }
    }
}
