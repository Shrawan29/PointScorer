import crypto from 'crypto';

import ENV from '../config/env.js';
import Friend from '../models/Friend.model.js';

const INVITE_TOKEN_BYTES = 24;

const normalizeInviteToken = (value) => String(value || '').trim().toLowerCase();

const toAppError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const isInviteExpired = (friend) => {
  const expiresAt = friend?.liveInviteExpiresAt ? new Date(friend.liveInviteExpiresAt).getTime() : 0;
  if (!expiresAt) return false;
  return expiresAt <= Date.now();
};

const resolveBaseUrlFromRequest = (req) => {
  const configuredFrontendBase =
    typeof process.env.FRONTEND_BASE_URL === 'string'
      ? process.env.FRONTEND_BASE_URL.trim().replace(/\/$/, '')
      : '';

  if (configuredFrontendBase) return configuredFrontendBase;

  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https')
    .split(',')[0]
    .trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || '')
    .split(',')[0]
    .trim();

  const originHeader = String(req?.headers?.origin || '').trim();
  const originBase = /^https?:\/\//i.test(originHeader)
    ? originHeader.replace(/\/$/, '')
    : '';

  if (originBase) return originBase;
  if (host) return `${proto}://${host}`;

  return '';
};

export const buildLiveInviteUrls = ({ req, token }) => {
  const safeToken = normalizeInviteToken(token);
  const encoded = encodeURIComponent(safeToken);
  const registerPath = `/register?invite=${encoded}`;
  const loginPath = `/login?invite=${encoded}`;
  const baseUrl = resolveBaseUrlFromRequest(req);

  return {
    token: safeToken,
    registerPath,
    loginPath,
    registerUrl: baseUrl ? `${baseUrl}${registerPath}` : registerPath,
    loginUrl: baseUrl ? `${baseUrl}${loginPath}` : loginPath,
  };
};

export const getFriendInviteByToken = async (token) => {
  const safeToken = normalizeInviteToken(token);
  if (!safeToken) {
    throw toAppError('inviteToken is required', 400);
  }

  const friend = await Friend.findOne({ liveInviteToken: safeToken });
  if (!friend) {
    throw toAppError('Invalid invite token', 404);
  }

  if (isInviteExpired(friend)) {
    throw toAppError('Invite token has expired', 410);
  }

  return friend;
};

export const createOrRefreshFriendInvite = async ({ friendId, hostUserId }) => {
  const friend = await Friend.findOne({ _id: friendId, userId: hostUserId });
  if (!friend) {
    throw toAppError('Friend not found', 404);
  }

  const ttlHours = Number(ENV.FRIEND_INVITE_TTL_HOURS);
  const safeTtlHours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 72;
  const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + safeTtlHours * 60 * 60 * 1000);

  friend.liveInviteToken = token;
  friend.liveInviteExpiresAt = expiresAt;
  await friend.save();

  return friend;
};

export const linkFriendByInviteToken = async ({ inviteToken, linkedUserId }) => {
  const friend = await getFriendInviteByToken(inviteToken);

  if (friend.linkedUserId && String(friend.linkedUserId) !== String(linkedUserId)) {
    throw toAppError('This invite is already linked to another account', 409);
  }

  const alreadyLinked = Boolean(friend.linkedUserId && String(friend.linkedUserId) === String(linkedUserId));

  if (!alreadyLinked) {
    friend.linkedUserId = linkedUserId;
    await friend.save();
  }

  return {
    alreadyLinked,
    friend,
  };
};

export default {
  buildLiveInviteUrls,
  getFriendInviteByToken,
  createOrRefreshFriendInvite,
  linkFriendByInviteToken,
};
