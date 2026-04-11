import dotenv from 'dotenv';

dotenv.config();

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'undefined') return fallback;
  return String(value).toLowerCase() === 'true';
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const ENV = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/pointscorer',
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRES_IN: '7d',
  INVITE_ONLY_REGISTRATION: toBoolean(process.env.INVITE_ONLY_REGISTRATION, false),
  GUEST_REGISTRATION_CAN_MANAGE_FRIENDS: toBoolean(
    process.env.GUEST_REGISTRATION_CAN_MANAGE_FRIENDS,
    false
  ),
  FRIEND_INVITE_TTL_HOURS: toNumber(process.env.FRIEND_INVITE_TTL_HOURS, 72),
  PRESENCE_TTL_MS: toNumber(process.env.PRESENCE_TTL_MS, 45_000),
  LIVE_ROOM_TTL_SECONDS: toNumber(process.env.LIVE_ROOM_TTL_SECONDS, 120),
  SELF_PING_ENABLED: toBoolean(process.env.SELF_PING_ENABLED, false),
  SELF_PING_INTERVAL_MINUTES: toNumber(process.env.SELF_PING_INTERVAL_MINUTES, 14),
  SELF_PING_TIMEOUT_MS: toNumber(process.env.SELF_PING_TIMEOUT_MS, 8000),
  SELF_PING_PATH: process.env.SELF_PING_PATH || '/health',
  SELF_PING_BASE_URL:
    process.env.SELF_PING_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '',
};

export default ENV;
