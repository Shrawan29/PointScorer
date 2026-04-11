import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

import ENV from '../config/env.js';
import Friend from '../models/Friend.model.js';
import User from '../models/User.model.js';
import {
  getUserPresence,
  markUserOffline,
  markUserOnline,
  sweepExpiredPresence,
} from './presence.service.js';

let io = null;
const socketCountByUserId = new Map();
let presenceSweepTimer = null;

const normalizeId = (value) => String(value || '').trim();

const userChannel = (userId) => `user:${normalizeId(userId)}`;
const roomChannel = (roomId) => `live-room:${normalizeId(roomId)}`;

const getPresenceSweepIntervalMs = () => {
  const ttlMs = Number(ENV.PRESENCE_TTL_MS);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return 8_000;
  return Math.max(3_000, Math.min(10_000, Math.floor(ttlMs / 3)));
};

const setSocketCountForUser = (userId, delta) => {
  const uid = normalizeId(userId);
  if (!uid) return 0;

  const current = Number(socketCountByUserId.get(uid) || 0);
  const next = Math.max(0, current + Number(delta || 0));

  if (next <= 0) {
    socketCountByUserId.delete(uid);
    return 0;
  }

  socketCountByUserId.set(uid, next);
  return next;
};

const extractBearerToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^bearer\s+/i.test(raw)) return raw.replace(/^bearer\s+/i, '').trim();
  return raw;
};

const resolveSocketToken = (socket) => {
  const authToken = extractBearerToken(socket?.handshake?.auth?.token);
  if (authToken) return authToken;

  const queryToken = extractBearerToken(socket?.handshake?.query?.token);
  if (queryToken) return queryToken;

  return extractBearerToken(socket?.handshake?.headers?.authorization);
};

const validateSocketSession = async (token) => {
  if (!token) {
    throw new Error('Missing token');
  }

  const decoded = jwt.verify(token, ENV.JWT_SECRET);
  if (!decoded?.userId || !decoded?.sessionId) {
    throw new Error('Invalid token payload');
  }

  const user = await User.findById(decoded.userId)
    .select('activeSessionId activeSessionExpiresAt')
    .lean();
  if (!user || !user.activeSessionId || !user.activeSessionExpiresAt) {
    throw new Error('Session not active');
  }
  if (String(user.activeSessionId) !== String(decoded.sessionId)) {
    throw new Error('Logged in on another device');
  }
  if (new Date(user.activeSessionExpiresAt).getTime() <= Date.now()) {
    throw new Error('Session expired');
  }

  return String(decoded.userId);
};

const emitToParticipantUsers = ({ hostUserId, guestUserId, eventName, payload }) => {
  if (!io) return;

  const sent = new Set();
  for (const id of [hostUserId, guestUserId]) {
    const userId = normalizeId(id);
    if (!userId || sent.has(userId)) continue;
    sent.add(userId);
    io.to(userChannel(userId)).emit(eventName, payload);
  }
};

const resolvePresenceAudienceUserIds = async (userId) => {
  const uid = normalizeId(userId);
  if (!uid) return [];

  const rows = await Friend.find({
    $or: [{ userId: uid }, { linkedUserId: uid }],
  })
    .select('userId linkedUserId')
    .lean();

  const audience = new Set([uid]);
  for (const row of rows) {
    const hostUserId = normalizeId(row?.userId);
    const guestUserId = normalizeId(row?.linkedUserId);
    if (hostUserId) audience.add(hostUserId);
    if (guestUserId) audience.add(guestUserId);
  }

  return Array.from(audience);
};

export const emitPresenceChangedForUser = async ({ userId, reason = 'updated' }) => {
  if (!io) return;

  const uid = normalizeId(userId);
  if (!uid) return;

  const presence = getUserPresence(uid);
  const audience = await resolvePresenceAudienceUserIds(uid);
  const payload = {
    userId: uid,
    isOnline: Boolean(presence?.isOnline),
    lastSeenAt: presence?.lastSeenAt || null,
    reason: String(reason || 'updated'),
    at: new Date().toISOString(),
  };

  for (const targetUserId of audience) {
    io.to(userChannel(targetUserId)).emit('presence:friends:changed', payload);
  }
};

const runPresenceSweep = async () => {
  // Keep connected-socket users alive in presence map.
  for (const userId of socketCountByUserId.keys()) {
    const marked = markUserOnline(userId, { skipSweep: true });
    if (marked?.becameOnline) {
      await emitPresenceChangedForUser({
        userId,
        reason: 'socket-keepalive',
      });
    }
  }

  const expiredUserIds = sweepExpiredPresence();
  for (const userId of expiredUserIds) {
    // Defensive: active sockets should already be kept alive.
    if (socketCountByUserId.has(String(userId))) continue;
    await emitPresenceChangedForUser({
      userId,
      reason: 'ttl-expired',
    });
  }
};

export const initializeLiveRoomRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (_origin, callback) => callback(null, true),
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = resolveSocketToken(socket);
      const userId = await validateSocketSession(token);
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  if (presenceSweepTimer) {
    clearInterval(presenceSweepTimer);
  }
  presenceSweepTimer = setInterval(() => {
    void runPresenceSweep().catch(() => {});
  }, getPresenceSweepIntervalMs());
  void runPresenceSweep().catch(() => {});

  io.on('connection', (socket) => {
    const userId = normalizeId(socket?.data?.userId);
    if (userId) {
      socket.join(userChannel(userId));
      setSocketCountForUser(userId, +1);
      const marked = markUserOnline(userId);
      if (marked?.becameOnline) {
        void emitPresenceChangedForUser({
          userId,
          reason: 'socket-connected',
        }).catch(() => {});
      }
    }

    socket.on('live-room:watch', (payload) => {
      const roomId = normalizeId(payload?.roomId);
      if (!roomId) return;
      socket.join(roomChannel(roomId));
    });

    socket.on('live-room:unwatch', (payload) => {
      const roomId = normalizeId(payload?.roomId);
      if (!roomId) return;
      socket.leave(roomChannel(roomId));
    });

    socket.on('disconnect', () => {
      if (!userId) return;

      const nextCount = setSocketCountForUser(userId, -1);
      if (nextCount > 0) return;

      const marked = markUserOffline(userId);
      if (marked?.wasOnline) {
        void emitPresenceChangedForUser({
          userId,
          reason: 'socket-disconnected',
        }).catch(() => {});
      }
    });
  });

  return io;
};

export const emitLiveRoomMutation = ({ roomId, hostUserId, guestUserId, status, reason = 'updated' }) => {
  if (!io) return;

  const safeRoomId = normalizeId(roomId);
  if (!safeRoomId) return;

  const payload = {
    roomId: safeRoomId,
    status: String(status || ''),
    reason: String(reason || 'updated'),
    at: new Date().toISOString(),
  };

  io.to(roomChannel(safeRoomId)).emit('live-room:changed', payload);
  emitToParticipantUsers({
    hostUserId,
    guestUserId,
    eventName: 'live-room:list:changed',
    payload,
  });
};

export default {
  initializeLiveRoomRealtime,
  emitLiveRoomMutation,
  emitPresenceChangedForUser,
};