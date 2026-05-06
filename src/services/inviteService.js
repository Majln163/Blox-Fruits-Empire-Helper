import { logger } from '../utils/logger.js';

const KEY = (guildId, userId) => `invites:${guildId}:user:${userId}`;
const JOIN_KEY = (guildId, memberId) => `invites:${guildId}:joined:${memberId}`;
const LB_KEY = (guildId) => `invites:${guildId}:all_users`;

export async function getInviteData(client, guildId, userId) {
  const data = await client.db.get(KEY(guildId, userId));
  return data ?? { total: 0, left: 0, bonus: 0 };
}

async function setInviteData(client, guildId, userId, data) {
  await client.db.set(KEY(guildId, userId), data);

  const allUsers = (await client.db.get(LB_KEY(guildId))) ?? [];
  if (!allUsers.includes(userId)) {
    allUsers.push(userId);
    await client.db.set(LB_KEY(guildId), allUsers);
  }
}

export function currentInvites({ total, left, bonus }) {
  return Math.max(0, total - left + bonus);
}

export async function incrementInvite(client, guildId, inviterId) {
  try {
    const data = await getInviteData(client, guildId, inviterId);
    data.total += 1;
    await setInviteData(client, guildId, inviterId, data);
    logger.debug(`Invite credited to ${inviterId} in guild ${guildId} (total: ${data.total})`);
  } catch (err) {
    logger.error(`Failed to increment invite for ${inviterId}:`, err);
  }
}

export async function markLeft(client, guildId, inviterId) {
  try {
    const data = await getInviteData(client, guildId, inviterId);
    data.left = Math.min(data.left + 1, data.total);
    await setInviteData(client, guildId, inviterId, data);
    logger.debug(`Invite marked as left for inviter ${inviterId} in guild ${guildId}`);
  } catch (err) {
    logger.error(`Failed to mark invite leave for ${inviterId}:`, err);
  }
}

export async function recordJoin(client, guildId, newMemberId, inviterId, code) {
  try {
    await client.db.set(JOIN_KEY(guildId, newMemberId), { inviterId, code, joinedAt: Date.now() });
  } catch (err) {
    logger.error(`Failed to record join for ${newMemberId}:`, err);
  }
}

export async function getJoinRecord(client, guildId, memberId) {
  return await client.db.get(JOIN_KEY(guildId, memberId));
}

export async function adjustBonusInvites(client, guildId, userId, amount) {
  const data = await getInviteData(client, guildId, userId);
  data.bonus = Math.max(0, (data.bonus ?? 0) + amount);
  await setInviteData(client, guildId, userId, data);
  return data;
}

export async function resetInviteData(client, guildId, userId) {
  const reset = { total: 0, left: 0, bonus: 0 };
  await setInviteData(client, guildId, userId, reset);
  return reset;
}

export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    const allUsers = (await client.db.get(LB_KEY(guildId))) ?? [];
    const entries = await Promise.all(
      allUsers.map(async (userId) => {
        const data = await getInviteData(client, guildId, userId);
        return { userId, ...data, current: currentInvites(data) };
      })
    );
    return entries
      .filter((e) => e.current > 0 || e.total > 0)
      .sort((a, b) => b.current - a.current || b.total - a.total)
      .slice(0, limit);
  } catch (err) {
    logger.error(`Failed to get invite leaderboard for ${guildId}:`, err);
    return [];
  }
}
