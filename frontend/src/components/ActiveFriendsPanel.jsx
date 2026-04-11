import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import { connectLiveSocket, disconnectLiveSocket } from '../api/liveSocket.js';
import Alert from './Alert.jsx';
import Button from './Button.jsx';
import Card from './Card.jsx';

const POLL_MS = 15_000;

const formatRoomExpiryLabel = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 'expiring now';
  if (n < 60) return `${Math.max(1, Math.floor(n))}s left`;
  const mins = Math.ceil(n / 60);
  return `${mins}m left`;
};

const getTurnLineClass = ({ isMyTurn, secondsToExpire }) => {
  if (!isMyTurn) return 'text-slate-500';

  const n = Number(secondsToExpire);
  if (Number.isFinite(n) && n <= 20) return 'text-rose-700';
  if (Number.isFinite(n) && n <= 45) return 'text-amber-700';
  return 'text-emerald-700';
};

const getStatusChipClass = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'DRAFTING' || s === 'CAPTAIN') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'LOBBY') return 'bg-slate-100 text-slate-600 border-slate-200';
  if (s === 'FROZEN') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const formatLastSeen = (value) => {
  if (!value) return 'Offline';
  try {
    return `Last seen ${new Date(value).toLocaleTimeString()}`;
  } catch {
    return 'Offline';
  }
};

export const ActiveFriendsPanel = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]);
  const [roomsByFriendId, setRoomsByFriendId] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveRealtimeConnected, setLiveRealtimeConnected] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const [presenceRes, roomsRes] = await Promise.all([
        axiosInstance.get('/api/presence/friends'),
        axiosInstance.get('/api/live-rooms').catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(presenceRes?.data?.friends) ? presenceRes.data.friends : [];
      setRows(list);

      const roomRows = Array.isArray(roomsRes?.data) ? roomsRes.data : [];
      setActiveRooms(roomRows);
      const byFriend = {};
      for (const room of roomRows) {
        const fid = String(room?.hostFriendId || room?.friendId || '').trim();
        if (!fid || byFriend[fid]) continue;
        byFriend[fid] = room;
      }
      setRoomsByFriendId(byFriend);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load active friends');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = connectLiveSocket();
    if (!socket) return undefined;

    const onConnect = () => {
      setLiveRealtimeConnected(true);
      void load({ silent: true });
    };
    const onDisconnect = () => {
      setLiveRealtimeConnected(false);
    };
    const onListChanged = () => {
      void load({ silent: true });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence:friends:changed', onListChanged);
    socket.on('live-room:list:changed', onListChanged);
    socket.on('live-room:changed', onListChanged);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      setLiveRealtimeConnected(false);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence:friends:changed', onListChanged);
      socket.off('live-room:list:changed', onListChanged);
      socket.off('live-room:changed', onListChanged);
      disconnectLiveSocket(socket);
    };
  }, [load]);

  useEffect(() => {
    if (liveRealtimeConnected) return undefined;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load({ silent: true });
    }, POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [liveRealtimeConnected, load]);

  const onlineRows = useMemo(() => rows.filter((r) => Boolean(r?.isOnline)), [rows]);
  const offlineRows = useMemo(() => rows.filter((r) => !r?.isOnline), [rows]);

  const renderRow = (row) => {
    const key = String(
      row?.relationshipId || `${String(row?.friendId || '')}:${String(row?.counterpartUserId || '')}`
    );
    const relationLabel =
      row?.relationType === 'HOST_VIEW'
        ? 'Linked friend account'
        : `Linked by user: ${row?.counterpartName || row?.displayName || 'User'}`;
    const activeRoom = roomsByFriendId[String(row?.friendId || '')] || null;
    const actionLabel = activeRoom ? 'Open active room' : 'Start live room';

    return (
      <div
        key={key}
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${row?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <div className="truncate text-sm font-semibold text-slate-900">{row?.displayName || 'Friend'}</div>
          </div>
          <div className="text-xs text-slate-500">{relationLabel}</div>
          {row?.hostAliasForYou ? (
            <div className="text-xs text-slate-500">Saved by host as: {row.hostAliasForYou}</div>
          ) : null}
          {activeRoom ? (
            <div className="text-xs text-emerald-600">
              Active room: {String(activeRoom?.status || 'LOBBY')} ({activeRoom?.secondsToExpire || '0'}s left)
            </div>
          ) : null}
          <div className="text-xs text-slate-500">{row?.isOnline ? 'Online now' : formatLastSeen(row?.lastSeenAt)}</div>
        </div>
        <div className="sm:w-48">
          <Button
            variant="secondary"
            fullWidth
            disabled={!activeRoom && !row?.isOnline}
            onClick={() =>
              navigate(activeRoom ? `/live-rooms/${activeRoom._id}` : `/live-rooms/new/${row.friendId}`)
            }
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-xs text-slate-600">
          Realtime status: {liveRealtimeConnected ? 'connected' : 'fallback polling'}.
        </div>
        <Button variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}

      {loading ? (
        <div className="text-sm text-slate-600">Loading...</div>
      ) : (
        <div className="grid gap-4">
          <Card title={`Active Live Rooms (${activeRooms.length})`}>
            {activeRooms.length === 0 ? (
              <div className="text-sm text-slate-600">No active live rooms right now.</div>
            ) : (
              <div className="grid gap-2">
                {activeRooms.map((room) => {
                  const roomId = String(room?._id || '').trim();
                  if (!roomId) return null;

                  const roomStatus = String(room?.status || 'LOBBY');
                  const isMyTurn = Boolean(room?.myTurn);
                  const counterpart = String(room?.counterpartDisplayName || '').trim() || 'Opponent';
                  const turnLineClass = getTurnLineClass({
                    isMyTurn,
                    secondsToExpire: room?.secondsToExpire,
                  });

                  return (
                    <div
                      key={roomId}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {room?.realMatchName || 'Live room'}
                        </div>
                        <div className="text-xs text-slate-500">Opponent: {counterpart}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusChipClass(roomStatus)}`}>
                            {roomStatus}
                          </span>
                          <span>Role: {String(room?.meRole || 'NA')}</span>
                        </div>
                        <div className={`text-xs ${turnLineClass}`}>
                          {isMyTurn ? 'Your turn to act' : 'Waiting for opponent'} • {formatRoomExpiryLabel(room?.secondsToExpire)}
                        </div>
                      </div>

                      <div className="sm:w-48">
                        <Button
                          variant="secondary"
                          fullWidth
                          onClick={() => navigate(`/live-rooms/${roomId}`)}
                        >
                          Open active room
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title={`Online now (${onlineRows.length})`}>
            {onlineRows.length === 0 ? (
              <div className="text-sm text-slate-600">No linked friends are online right now.</div>
            ) : (
              <div className="grid gap-2">{onlineRows.map((row) => renderRow(row))}</div>
            )}
          </Card>

          <Card title={`Offline (${offlineRows.length})`}>
            {offlineRows.length === 0 ? (
              <div className="text-sm text-slate-600">No offline linked users.</div>
            ) : (
              <div className="grid gap-2">{offlineRows.map((row) => renderRow(row))}</div>
            )}
          </Card>
        </div>
      )}
    </>
  );
};

export default ActiveFriendsPanel;
