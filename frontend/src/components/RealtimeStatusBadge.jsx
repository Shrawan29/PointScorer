import React, { useEffect, useState } from 'react';

import axiosInstance from '../api/axiosInstance.js';
import { connectLiveSocket, disconnectLiveSocket } from '../api/liveSocket.js';

const SUMMARY_POLL_MS = 15_000;

export const RealtimeStatusBadge = ({ onSummaryChange }) => {
  const [connected, setConnected] = useState(false);
  const [activeFriendsCount, setActiveFriendsCount] = useState(0);
  const [activeRoomsCount, setActiveRoomsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const [presenceRes, roomsRes] = await Promise.all([
          axiosInstance.get('/api/presence/friends').catch(() => ({ data: {} })),
          axiosInstance.get('/api/live-rooms').catch(() => ({ data: [] })),
        ]);

        if (cancelled) return;

        const activeFriendsFromCount = Number(presenceRes?.data?.onlineCount);
        const activeFriendsFromList = Array.isArray(presenceRes?.data?.friends)
          ? presenceRes.data.friends.filter((row) => Boolean(row?.isOnline)).length
          : 0;
        const nextActiveFriendsCount = Number.isFinite(activeFriendsFromCount)
          ? activeFriendsFromCount
          : activeFriendsFromList;
        const roomRows = Array.isArray(roomsRes?.data) ? roomsRes.data : [];
        const nextActiveRoomsCount = roomRows.length;

        const safeActiveFriends = Math.max(0, nextActiveFriendsCount);
        const safeActiveRooms = Math.max(0, nextActiveRoomsCount);

        setActiveFriendsCount(safeActiveFriends);
        setActiveRoomsCount(safeActiveRooms);

        if (typeof onSummaryChange === 'function') {
          onSummaryChange({
            activeFriendsCount: safeActiveFriends,
            activeRoomsCount: safeActiveRooms,
          });
        }
      } catch {
        // ignore badge summary refresh failures
      }
    };

    const socket = connectLiveSocket();
    if (!socket) {
      setConnected(false);
      void loadSummary();
      return () => {
        cancelled = true;
      };
    }

    const onConnect = () => {
      setConnected(true);
      void loadSummary();
    };
    const onDisconnect = () => setConnected(false);
    const onSummaryChanged = () => {
      void loadSummary();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence:friends:changed', onSummaryChanged);
    socket.on('live-room:list:changed', onSummaryChanged);
    socket.on('live-room:changed', onSummaryChanged);

    if (socket.connected) {
      onConnect();
    } else {
      void loadSummary();
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadSummary();
    }, SUMMARY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence:friends:changed', onSummaryChanged);
      socket.off('live-room:list:changed', onSummaryChanged);
      socket.off('live-room:changed', onSummaryChanged);
      disconnectLiveSocket(socket);
    };
  }, [onSummaryChange]);

  const hasActiveRooms = activeRoomsCount > 0;

  return (
    <div className="inline-flex items-center gap-1.5" aria-live="polite">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
          connected
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}
        title={connected ? 'Realtime push connected' : 'Using polling fallback'}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="sm:hidden">{connected ? 'Push' : 'Poll'}</span>
        <span className="hidden sm:inline">{connected ? 'Push' : 'Polling'}</span>
      </div>

      <div
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
          hasActiveRooms
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
        title={`${activeFriendsCount} active friends, ${activeRoomsCount} active rooms`}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${hasActiveRooms ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        <span className="hidden sm:inline">Active Friends {activeFriendsCount}</span>
        <span className="hidden sm:inline">|</span>
        <span className="hidden sm:inline">Active Rooms {activeRoomsCount}</span>
        <span className="sm:hidden">{activeFriendsCount}/{activeRoomsCount}</span>
      </div>

      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-500"
        title="Push = instant realtime updates. Polling = periodic fallback refresh when realtime is unavailable."
        aria-label="Realtime legend"
      >
        i
      </span>
    </div>
  );
};

export default RealtimeStatusBadge;