import { io } from 'socket.io-client';

import axiosInstance from './axiosInstance.js';

const resolveSocketBaseUrl = () => {
  const base = String(axiosInstance.defaults?.baseURL || '').trim();
  if (!base) return undefined;

  try {
    const parsed = new URL(base, typeof window !== 'undefined' ? window.location.origin : undefined);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return base;
  }
};

export const connectLiveSocket = () => {
  const token = String(localStorage.getItem('token') || '').trim();
  if (!token) return null;

  return io(resolveSocketBaseUrl(), {
    transports: ['websocket', 'polling'],
    auth: { token },
  });
};

export const disconnectLiveSocket = (socket) => {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch {
    // ignore disconnect errors
  }
};

export default {
  connectLiveSocket,
  disconnectLiveSocket,
};