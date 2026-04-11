import ENV from '../config/env.js';

const presenceByUserId = new Map();

const getTtlMs = () => {
  const v = Number(ENV.PRESENCE_TTL_MS);
  return Number.isFinite(v) && v > 0 ? v : 45_000;
};

export const sweepExpiredPresence = () => {
  const ttlMs = getTtlMs();
  const now = Date.now();
  const expiredUserIds = [];

  for (const [userId, payload] of presenceByUserId.entries()) {
    const lastSeenAt = Number(payload?.lastSeenAt || 0);
    if (!lastSeenAt || now - lastSeenAt > ttlMs) {
      presenceByUserId.delete(userId);
      expiredUserIds.push(String(userId));
    }
  }

  return expiredUserIds;
};

export const markUserOnline = (userId, { skipSweep = false } = {}) => {
  const key = String(userId || '').trim();
  if (!key) return null;

  if (!skipSweep) {
    sweepExpiredPresence();
  }
  const wasOnline = presenceByUserId.has(key);

  const now = Date.now();
  presenceByUserId.set(key, { lastSeenAt: now });
  return {
    userId: key,
    lastSeenAt: now,
    becameOnline: !wasOnline,
  };
};

export const markUserOffline = (userId) => {
  const key = String(userId || '').trim();
  if (!key) return null;

  const wasOnline = presenceByUserId.delete(key);
  return {
    userId: key,
    wasOnline,
  };
};

export const getUserPresence = (userId) => {
  sweepExpiredPresence();

  const key = String(userId || '').trim();
  if (!key) return { isOnline: false, lastSeenAt: null };

  const payload = presenceByUserId.get(key);
  if (!payload) return { isOnline: false, lastSeenAt: null };

  return {
    isOnline: true,
    lastSeenAt: new Date(Number(payload.lastSeenAt)).toISOString(),
  };
};

export const getPresenceSummary = () => {
  sweepExpiredPresence();
  return {
    onlineUsers: presenceByUserId.size,
    ttlMs: getTtlMs(),
  };
};

export default {
  markUserOnline,
  markUserOffline,
  sweepExpiredPresence,
  getUserPresence,
  getPresenceSummary,
};
