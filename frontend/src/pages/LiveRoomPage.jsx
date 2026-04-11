import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import { connectLiveSocket, disconnectLiveSocket } from '../api/liveSocket.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const ROOM_POLL_MS = 2_500;
const MIN_TEAM_SIZE = 6;
const MAX_TEAM_SIZE = 9;

const normalizePlayer = (value) =>
  String(value || '')
    .replace(/[\u2020†*]/g, '')
    .replace(/\[(?:[^\]]*)\]/g, '')
    .replace(/\((?:[^)]*)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const uniquePlayers = (arr) => {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(arr) ? arr : []) {
    const p = normalizePlayer(raw);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
};

const getPlayersByTeam = (squads) => {
  const grouped = {};

  const team1Name = squads?.team1?.name || null;
  const team2Name = squads?.team2?.name || null;

  const team1Squad = uniquePlayers(squads?.team1?.squad || []);
  const team2Squad = uniquePlayers(squads?.team2?.squad || []);
  const team1PlayingXI = uniquePlayers(squads?.team1?.playingXI || []);
  const team2PlayingXI = uniquePlayers(squads?.team2?.playingXI || []);
  const flatPlayingXI = uniquePlayers(squads?.playingXI || []);
  const fallback = uniquePlayers(squads?.players || []);

  const hasTeamPlayingXI = team1PlayingXI.length > 0 || team2PlayingXI.length > 0;
  const hasTeamSquads = team1Squad.length > 0 || team2Squad.length > 0;
  const usePlayingXI = Boolean(squads?.isPlayingXIDeclared) && (hasTeamPlayingXI || flatPlayingXI.length > 0);

  if (usePlayingXI && hasTeamPlayingXI) {
    if (team1PlayingXI.length > 0) grouped[team1Name || 'Team 1'] = team1PlayingXI;
    if (team2PlayingXI.length > 0) grouped[team2Name || 'Team 2'] = team2PlayingXI;
    return grouped;
  }

  if (usePlayingXI && flatPlayingXI.length > 0) {
    if ((team1Name || team2Name) && flatPlayingXI.length >= 2) {
      const split = Math.ceil(flatPlayingXI.length / 2);
      grouped[team1Name || 'Team 1'] = flatPlayingXI.slice(0, split);
      grouped[team2Name || 'Team 2'] = flatPlayingXI.slice(split);
      return grouped;
    }
    grouped['Playing XI'] = flatPlayingXI;
    return grouped;
  }

  if (hasTeamSquads) {
    if (team1Squad.length > 0) grouped[team1Name || 'Team 1'] = team1Squad;
    if (team2Squad.length > 0) grouped[team2Name || 'Team 2'] = team2Squad;
    return grouped;
  }

  const flat = flatPlayingXI.length > 0 ? flatPlayingXI : fallback;
  if (flat.length === 0) return grouped;

  if ((team1Name || team2Name) && flat.length >= 2) {
    const split = Math.ceil(flat.length / 2);
    grouped[team1Name || 'Team 1'] = flat.slice(0, split);
    grouped[team2Name || 'Team 2'] = flat.slice(split);
    return grouped;
  }

  grouped['Players'] = flat;
  return grouped;
};

export const LiveRoomPage = () => {
  const { roomId } = useParams();

  const [room, setRoom] = useState(null);
  const [squads, setSquads] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captainChoice, setCaptainChoice] = useState('');
  const [liveRealtimeConnected, setLiveRealtimeConnected] = useState(false);
  const [search, setSearch] = useState('');

  const loadRoom = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const res = await axiosInstance.get(`/api/live-rooms/${roomId}`);
      const payload = res?.data || null;
      setRoom(payload);
      setError('');

      if (payload?.realMatchId) {
        const squadsRes = await axiosInstance.get(`/api/cricket/matches/${payload.realMatchId}/squads`);
        setSquads(squadsRes?.data || null);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load live room');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    const socket = connectLiveSocket();
    if (!socket) return undefined;

    const watchPayload = { roomId };

    const onConnect = () => {
      setLiveRealtimeConnected(true);
      socket.emit('live-room:watch', watchPayload);
      void loadRoom({ silent: true });
    };
    const onDisconnect = () => {
      setLiveRealtimeConnected(false);
    };
    const onRoomChanged = (payload) => {
      const changedRoomId = String(payload?.roomId || '').trim();
      if (changedRoomId && changedRoomId !== String(roomId || '')) return;
      void loadRoom({ silent: true });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live-room:changed', onRoomChanged);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      setLiveRealtimeConnected(false);
      socket.emit('live-room:unwatch', watchPayload);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live-room:changed', onRoomChanged);
      disconnectLiveSocket(socket);
    };
  }, [loadRoom, roomId]);

  useEffect(() => {
    if (liveRealtimeConnected) return undefined;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadRoom({ silent: true });
    }, ROOM_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [liveRealtimeConnected, loadRoom]);

  const meRole = room?.meRole;
  const myPlayers = useMemo(
    () => uniquePlayers(meRole === 'HOST' ? room?.hostPlayers : room?.guestPlayers),
    [room, meRole],
  );
  const otherPlayers = useMemo(
    () => uniquePlayers(meRole === 'HOST' ? room?.guestPlayers : room?.hostPlayers),
    [room, meRole],
  );

  const allPickedKeys = useMemo(() => {
    const out = new Set();
    for (const p of [...myPlayers, ...otherPlayers]) out.add(String(p).toLowerCase());
    return out;
  }, [myPlayers, otherPlayers]);

  const myPickedKeys = useMemo(
    () => new Set(myPlayers.map((p) => normalizePlayer(p).toLowerCase())),
    [myPlayers]
  );
  const opponentPickedKeys = useMemo(
    () => new Set(otherPlayers.map((p) => normalizePlayer(p).toLowerCase())),
    [otherPlayers]
  );

  const playersByTeam = useMemo(() => getPlayersByTeam(squads), [squads]);
  const filteredPlayersByTeam = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return playersByTeam;

    const out = {};
    for (const [teamName, players] of Object.entries(playersByTeam)) {
      const filtered = players.filter((p) => String(p || '').toLowerCase().includes(q));
      if (filtered.length > 0) {
        out[teamName] = filtered;
      }
    }

    return out;
  }, [playersByTeam, search]);
  const status = String(room?.status || '');
  const isTerminal = status === 'FROZEN' || status === 'CANCELLED' || status === 'EXPIRED';
  const hostCount = Array.isArray(room?.hostPlayers) ? room.hostPlayers.length : 0;
  const guestCount = Array.isArray(room?.guestPlayers) ? room.guestPlayers.length : 0;
  const draftLockEligible =
    hostCount >= MIN_TEAM_SIZE &&
    hostCount <= MAX_TEAM_SIZE &&
    guestCount >= MIN_TEAM_SIZE &&
    guestCount <= MAX_TEAM_SIZE;
  const captainRequired = Boolean(room?.captainRequired);
  const captainComplete = !captainRequired || (Boolean(room?.hostCaptain) && Boolean(room?.guestCaptain));
  const canLockSelection =
    !isTerminal &&
    draftLockEligible &&
    !(status === 'CAPTAIN' && captainRequired && !captainComplete);

  const onSetReady = async (ready) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/ready`, { ready });
      setRoom(res?.data || null);
      setInfo(ready ? 'Ready confirmed' : 'Ready removed');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update ready state');
      if (Number(err?.response?.status || 0) === 409) {
        await loadRoom({ silent: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (player) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/pick`, { player });
      setRoom(res?.data || null);
      setInfo(`Picked ${player}`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to pick player');
      if (Number(err?.response?.status || 0) === 409) {
        await loadRoom({ silent: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const onSelectCaptain = async () => {
    if (!captainChoice) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/captain`, { captain: captainChoice });
      setRoom(res?.data || null);
      setInfo('Captain selected');
      setCaptainChoice('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to set captain');
      if (Number(err?.response?.status || 0) === 409) {
        await loadRoom({ silent: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const onCancelRoom = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/cancel`);
      setRoom(res?.data || null);
      setInfo('Room cancelled');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to cancel room');
    } finally {
      setBusy(false);
    }
  };

  const onLockSelection = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/freeze`);
      const nextRoom = res?.data || null;
      setRoom(nextRoom);
      const nextStatus = String(nextRoom?.status || '').toUpperCase();
      if (nextStatus === 'FROZEN') {
        setInfo('Selection locked and frozen');
      } else if (nextStatus === 'CAPTAIN') {
        setInfo('Minimum picks reached. Captain selection started.');
      } else {
        setInfo('Lock updated');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to lock selection');
      if (Number(err?.response?.status || 0) === 409) {
        await loadRoom({ silent: true });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Live Draft Room"
        subtitle={
          room?.realMatchName
            ? `${room.realMatchName} • ${liveRealtimeConnected ? 'realtime connected' : 'fallback polling'}`
            : 'Live selection in progress'
        }
        actions={
          <Link to="/friends?tab=active">
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error ? <Alert type="error">{error}</Alert> : null}
      {info ? <Alert type="success" floating>{info}</Alert> : null}

      {loading ? (
        <div className="text-sm text-slate-600">Loading room...</div>
      ) : !room ? null : (
        <div className="grid gap-4">
          <Card title="Room Status">
            <div className="text-sm text-slate-800">Status: {status}</div>
            <div className="text-sm text-slate-800">Your role: {meRole || 'NA'}</div>
            <div className="text-sm text-slate-800">Your turn: {room?.myTurn ? 'Yes' : 'No'}</div>
            <div className="text-sm text-slate-800">Ready: {room?.meReady ? 'Yes' : 'No'}</div>
            <div className="text-sm text-slate-800">Opponent ready: {room?.counterpartReady ? 'Yes' : 'No'}</div>
            <div className="text-sm text-slate-800">Picks: Host {hostCount}/9 • Guest {guestCount}/9 (lock at 6-9)</div>
            {captainRequired ? (
              <div className="text-sm text-slate-800">
                Captains: Host {room?.hostCaptain || 'Pending'} • Guest {room?.guestCaptain || 'Pending'}
              </div>
            ) : null}
            {canLockSelection ? (
              <div className="text-xs text-emerald-700">
                {captainRequired && !captainComplete
                  ? status === 'CAPTAIN'
                    ? 'Select both captains to enable lock.'
                    : 'You can lock now to move into captain selection.'
                  : 'Selection is ready to lock.'}
              </div>
            ) : null}
            {!isTerminal && typeof room?.secondsToExpire === 'number' ? (
              <div className="text-sm text-slate-800">Room timeout in: {room.secondsToExpire}s</div>
            ) : null}
            {status === 'CANCELLED' && room?.cancelReason ? (
              <div className="text-xs text-rose-600 mt-1">Cancelled: {room.cancelReason}</div>
            ) : null}
            {status === 'EXPIRED' ? (
              <div className="text-xs text-amber-700 mt-1">Room expired due to timeout.</div>
            ) : null}
            {!isTerminal && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button onClick={() => onSetReady(true)} disabled={busy || room?.meReady}>Ready</Button>
                <Button variant="secondary" onClick={() => onSetReady(false)} disabled={busy || !room?.meReady}>Unready</Button>
                <Button onClick={onLockSelection} disabled={busy || !canLockSelection}>Lock</Button>
                <Button variant="danger" onClick={onCancelRoom} disabled={busy}>Cancel</Button>
              </div>
            )}
            {status === 'FROZEN' && room?.sessionId ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Link to={`/sessions/${room.sessionId}/result`}>
                  <Button variant="secondary" fullWidth>Open result</Button>
                </Link>
                <Link to={`/sessions/${room.sessionId}/breakdown`}>
                  <Button variant="secondary" fullWidth>Open breakdown</Button>
                </Link>
                <Link to={`/player-selection/${room.sessionId}`}>
                  <Button variant="secondary" fullWidth>Open selection</Button>
                </Link>
              </div>
            ) : null}
          </Card>

          <Card title="Your Picks">
            {myPlayers.length === 0 ? (
              <div className="text-sm text-slate-600">No players picked yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {myPlayers.map((p) => (
                  <span key={`my-${p}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title="Opponent Picks">
            {otherPlayers.length === 0 ? (
              <div className="text-sm text-slate-600">No players picked yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {otherPlayers.map((p) => (
                  <span key={`opp-${p}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {status === 'DRAFTING' && (
            <Card title="Pick Players (Turn-by-turn)">
              {draftLockEligible ? (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                  {captainRequired
                    ? 'Minimum picks reached. Click Lock to start captain selection now, or continue drafting up to 9 each.'
                    : 'Minimum picks reached. Click Lock now, or continue drafting up to 9 each.'}
                </div>
              ) : null}

              {squads?.isPlayingXIDeclared === false ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  Playing XI not declared yet. Showing squads for drafting.
                </div>
              ) : null}

              <div className="relative mb-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search players..."
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              {Object.keys(filteredPlayersByTeam).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
                  {Object.keys(playersByTeam).length === 0
                    ? 'No player pool available yet.'
                    : `No players match "${search}".`}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(filteredPlayersByTeam).map(([teamName, players], teamIndex) => (
                    <div key={teamName} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-bold text-white">
                          {teamIndex + 1}
                        </span>
                        <span className="truncate text-xs font-bold tracking-wide text-slate-700">{teamName}</span>
                        <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand)]">
                          {players.length}p
                        </span>
                      </div>

                      <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto bg-white">
                        {players.map((p) => {
                          const key = normalizePlayer(p).toLowerCase();
                          const pickedByMe = myPickedKeys.has(key);
                          const pickedByOpponent = opponentPickedKeys.has(key);
                          const alreadyPicked = allPickedKeys.has(key);

                          return (
                            <div key={`${teamName}:${p}`} className="flex items-center justify-between gap-2 px-3 py-2">
                              <span className="truncate text-sm text-slate-800">{p}</span>
                              <Button
                                variant="secondary"
                                className="h-8 min-w-[58px] px-2 text-[11px]"
                                onClick={() => onPick(p)}
                                disabled={busy || !room?.myTurn || alreadyPicked}
                              >
                                {pickedByMe ? 'Yours' : pickedByOpponent ? 'Opp' : 'Pick'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {status === 'CAPTAIN' && (
            <Card title="Captain Selection">
              {captainComplete ? (
                <div className="grid gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                    Captains are selected. Click <strong>Lock</strong> to freeze the selection.
                  </div>
                  <Button onClick={onLockSelection} disabled={busy || !canLockSelection}>
                    Lock Selection
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <select
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900"
                    value={captainChoice}
                    onChange={(e) => setCaptainChoice(e.target.value)}
                    disabled={busy || !room?.myTurn}
                  >
                    <option value="">Select captain</option>
                    {myPlayers.map((p) => (
                      <option key={`cap-${p}`} value={p}>{p}</option>
                    ))}
                  </select>
                  <Button onClick={onSelectCaptain} disabled={busy || !room?.myTurn || !captainChoice}>
                    Confirm Captain
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </Layout>
  );
};

export default LiveRoomPage;
