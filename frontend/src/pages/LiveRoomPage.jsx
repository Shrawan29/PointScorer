import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import { connectLiveSocket, disconnectLiveSocket } from '../api/liveSocket.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Layout from '../components/Layout.jsx';

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

// ── Tiny primitives ──────────────────────────────────────────────────────────

const StatCell = ({ label, value, valueClass = '' }) => (
  <div className="flex flex-col gap-0.5 px-3 py-2 border-r border-b border-slate-100 last:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 [&:nth-child(2n)]:border-r-0">
    <span className="text-[10px] text-slate-500">{label}</span>
    <span className={`text-[13px] font-medium text-slate-900 ${valueClass}`}>{value}</span>
  </div>
);

const PlayerTag = ({ name, variant = 'mine' }) => {
  const cls =
    variant === 'mine'
      ? 'bg-[#EEEDFE] text-[#3C3489] border-[rgba(127,119,221,0.3)]'
      : 'bg-slate-100 text-slate-500 border-transparent';
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
      {name}
    </span>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

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

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  useEffect(() => {
    const socket = connectLiveSocket();
    if (!socket) return undefined;
    const watchPayload = { roomId };
    const onConnect = () => {
      setLiveRealtimeConnected(true);
      socket.emit('live-room:watch', watchPayload);
      void loadRoom({ silent: true });
    };
    const onDisconnect = () => setLiveRealtimeConnected(false);
    const onRoomChanged = (payload) => {
      const changedRoomId = String(payload?.roomId || '').trim();
      if (changedRoomId && changedRoomId !== String(roomId || '')) return;
      void loadRoom({ silent: true });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live-room:changed', onRoomChanged);
    if (socket.connected) onConnect();
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
    return () => clearInterval(timer);
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
  const myPickedKeys = useMemo(() => new Set(myPlayers.map((p) => normalizePlayer(p).toLowerCase())), [myPlayers]);
  const opponentPickedKeys = useMemo(() => new Set(otherPlayers.map((p) => normalizePlayer(p).toLowerCase())), [otherPlayers]);

  const playersByTeam = useMemo(() => getPlayersByTeam(squads), [squads]);
  const filteredPlayersByTeam = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return playersByTeam;
    const out = {};
    for (const [teamName, players] of Object.entries(playersByTeam)) {
      const filtered = players.filter((p) => String(p || '').toLowerCase().includes(q));
      if (filtered.length > 0) out[teamName] = filtered;
    }
    return out;
  }, [playersByTeam, search]);

  const status = String(room?.status || '');
  const isTerminal = status === 'FROZEN' || status === 'CANCELLED' || status === 'EXPIRED';
  const hostCount = Array.isArray(room?.hostPlayers) ? room.hostPlayers.length : 0;
  const guestCount = Array.isArray(room?.guestPlayers) ? room.guestPlayers.length : 0;
  const draftLockEligible =
    hostCount >= MIN_TEAM_SIZE && hostCount <= MAX_TEAM_SIZE &&
    guestCount >= MIN_TEAM_SIZE && guestCount <= MAX_TEAM_SIZE;
  const captainRequired = Boolean(room?.captainRequired);
  const captainComplete = !captainRequired || (Boolean(room?.hostCaptain) && Boolean(room?.guestCaptain));
  const meLocked = Boolean(room?.meLocked);
  const counterpartLocked = Boolean(room?.counterpartLocked);
  const bothLocked = Boolean(room?.bothLocked) || (meLocked && counterpartLocked);
  const canLockSelection =
    !isTerminal &&
    draftLockEligible &&
    !(status === 'CAPTAIN' && captainRequired && !captainComplete);

  const onSetReady = async (ready) => {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/ready`, { ready });
      setRoom(res?.data || null);
      setInfo(ready ? 'Ready confirmed' : 'Ready removed');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update ready state');
      if (Number(err?.response?.status || 0) === 409) await loadRoom({ silent: true });
    } finally { setBusy(false); }
  };

  const onPick = async (player) => {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/pick`, { player });
      setRoom(res?.data || null);
      setInfo(`Picked ${player}`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to pick player');
      if (Number(err?.response?.status || 0) === 409) await loadRoom({ silent: true });
    } finally { setBusy(false); }
  };

  const onSelectCaptain = async () => {
    if (!captainChoice) return;
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/captain`, { captain: captainChoice });
      setRoom(res?.data || null);
      setInfo('Captain selected');
      setCaptainChoice('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to set captain');
      if (Number(err?.response?.status || 0) === 409) await loadRoom({ silent: true });
    } finally { setBusy(false); }
  };

  const onCancelRoom = async () => {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/cancel`);
      setRoom(res?.data || null);
      setInfo('Room cancelled');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to cancel room');
    } finally { setBusy(false); }
  };

  const onLockSelection = async () => {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await axiosInstance.post(`/api/live-rooms/${roomId}/freeze`);
      const nextRoom = res?.data || null;
      setRoom(nextRoom);
      const nextStatus = String(nextRoom?.status || '').toUpperCase();
      if (nextStatus === 'FROZEN') setInfo('Both locks confirmed. Selection locked and frozen.');
      else if (nextStatus === 'CAPTAIN') setInfo('Minimum picks reached. Captain selection started.');
      else if (nextRoom?.meLocked && !nextRoom?.counterpartLocked) setInfo('Your lock is confirmed. Waiting for opponent lock.');
      else setInfo('Lock updated');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to lock selection');
      if (Number(err?.response?.status || 0) === 409) await loadRoom({ silent: true });
    } finally { setBusy(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-[15px] font-medium text-slate-900 leading-tight">Live Draft Room</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {liveRealtimeConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span className="text-[11px] text-slate-500 truncate">
              {room?.realMatchName
                ? `${room.realMatchName} · ${liveRealtimeConnected ? 'live' : 'polling'}`
                : 'Live selection in progress'}
            </span>
          </div>
        </div>
        <Link to="/friends?tab=active" className="shrink-0">
          <Button variant="secondary">Back</Button>
        </Link>
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}
      {info ? <Alert type="success" floating>{info}</Alert> : null}

      {loading ? (
        <div className="text-sm text-slate-500 py-8 text-center">Loading room...</div>
      ) : !room ? null : (
        <div className="grid gap-3">

          {/* Your-turn banner */}
          {!isTerminal && room?.myTurn && (
            <div className="rounded-xl bg-[#EEEDFE] border border-[rgba(127,119,221,0.4)] px-3 py-2.5 text-[12.5px] font-medium text-[#3C3489] text-center">
              Your turn to pick
            </div>
          )}

          {/* Status card */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
              <span className="text-[12.5px] font-medium text-slate-800">Room status</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                status === 'FROZEN' ? 'bg-slate-100 text-slate-600 border-slate-200'
                : status === 'CAPTAIN' ? 'bg-amber-50 text-amber-700 border-amber-200'
                : status === 'CANCELLED' || status === 'EXPIRED' ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {status || 'UNKNOWN'}
              </span>
            </div>

            <div className="grid grid-cols-2">
              <StatCell label="Your role" value={meRole || '—'} />
              <StatCell label="Your turn" value={room?.myTurn ? 'Yes' : 'No'} valueClass={room?.myTurn ? 'text-emerald-600' : ''} />
              <StatCell label="You" value={room?.meReady ? 'Ready' : 'Not ready'} valueClass={room?.meReady ? 'text-emerald-600' : 'text-slate-400'} />
              <StatCell label="Opponent" value={room?.counterpartReady ? 'Ready' : 'Not ready'} valueClass={room?.counterpartReady ? 'text-emerald-600' : 'text-slate-400'} />
              <StatCell
                label="Picks"
                value={`Host ${hostCount}/9 · Guest ${guestCount}/9`}
              />
              {!isTerminal && draftLockEligible ? (
                <StatCell
                  label="Locks"
                  value={`You ${meLocked ? 'Locked' : 'Pending'} · Opp ${counterpartLocked ? 'Locked' : 'Pending'}`}
                  valueClass={bothLocked ? 'text-emerald-600' : meLocked ? 'text-amber-600' : ''}
                />
              ) : <div />}
            </div>

            {captainRequired && (
              <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500">
                Captains — Host: <span className="text-slate-800">{room?.hostCaptain || 'Pending'}</span>
                {' · '}
                Guest: <span className="text-slate-800">{room?.guestCaptain || 'Pending'}</span>
              </div>
            )}

            {/* Status hint */}
            {canLockSelection && (
              <div className={`px-3 py-2 border-t text-[11px] ${
                meLocked && !bothLocked
                  ? 'border-amber-100 bg-amber-50 text-amber-700'
                  : bothLocked
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-slate-100 bg-slate-50 text-slate-600'
              }`}>
                {bothLocked
                  ? 'Both locks confirmed. Finalizing selection.'
                  : meLocked
                    ? 'Your lock confirmed. Waiting for opponent.'
                    : counterpartLocked
                      ? 'Opponent locked. Tap Lock to confirm yours.'
                      : captainRequired && !captainComplete && status === 'CAPTAIN'
                        ? 'Select both captains to enable lock.'
                        : 'Both users must lock to freeze selection.'}
              </div>
            )}

            {status === 'CANCELLED' && room?.cancelReason && (
              <div className="px-3 py-2 border-t border-red-100 bg-red-50 text-[11px] text-red-600">
                Cancelled: {room.cancelReason}
              </div>
            )}
            {status === 'EXPIRED' && (
              <div className="px-3 py-2 border-t border-amber-100 bg-amber-50 text-[11px] text-amber-700">
                Room expired due to timeout.
              </div>
            )}
            {!isTerminal && typeof room?.secondsToExpire === 'number' && (
              <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500">
                Expires in {room.secondsToExpire}s
              </div>
            )}
          </div>

          {/* Action strip */}
          {!isTerminal && (
            <div className="flex gap-2">
              {!room?.meReady ? (
                <Button onClick={() => onSetReady(true)} disabled={busy} className="flex-1">
                  Ready
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => onSetReady(false)} disabled={busy} className="flex-1">
                  Unready
                </Button>
              )}
              <Button
                onClick={onLockSelection}
                disabled={busy || !canLockSelection || meLocked}
                className="flex-1"
              >
                {meLocked ? 'Locked ✓' : 'Lock'}
              </Button>
              <Button variant="danger" onClick={onCancelRoom} disabled={busy} className="flex-1">
                Cancel
              </Button>
            </div>
          )}

          {/* Frozen session links */}
          {status === 'FROZEN' && room?.sessionId && (
            <div className="grid grid-cols-3 gap-2">
              <Link to={`/sessions/${room.sessionId}/result`}>
                <Button variant="secondary" fullWidth>Result</Button>
              </Link>
              <Link to={`/sessions/${room.sessionId}/breakdown`}>
                <Button variant="secondary" fullWidth>Breakdown</Button>
              </Link>
              <Link to={`/player-selection/${room.sessionId}`}>
                <Button variant="secondary" fullWidth>Selection</Button>
              </Link>
            </div>
          )}

          {/* Picks — side by side */}
          <div className="grid grid-cols-2 gap-2">
            {/* My picks */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-medium text-slate-700">Your picks</span>
                <span className="text-[10px] font-medium bg-[#EEEDFE] text-[#3C3489] px-1.5 py-0.5 rounded-full">
                  {myPlayers.length}
                </span>
              </div>
              {myPlayers.length === 0 ? (
                <p className="text-[11px] text-slate-400">None yet</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {myPlayers.map((p) => <PlayerTag key={`my-${p}`} name={p} variant="mine" />)}
                </div>
              )}
            </div>
            {/* Opponent picks */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-medium text-slate-700">Opponent</span>
                <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                  {otherPlayers.length}
                </span>
              </div>
              {otherPlayers.length === 0 ? (
                <p className="text-[11px] text-slate-400">None yet</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {otherPlayers.map((p) => <PlayerTag key={`opp-${p}`} name={p} variant="opp" />)}
                </div>
              )}
            </div>
          </div>

          {/* Draft panel */}
          {status === 'DRAFTING' && (
            <div className="grid gap-3">
              {draftLockEligible && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] text-emerald-700">
                  {captainRequired
                    ? 'Minimum picks reached. Lock now to start captain selection, or continue up to 9 each.'
                    : 'Minimum picks reached. Lock when ready — both users must lock to freeze.'}
                </div>
              )}
              {squads?.isPlayingXIDeclared === false && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-500">
                  Playing XI not declared yet. Showing squads for drafting.
                </div>
              )}

              {/* Search */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand)]"
              />

              {/* Player grid */}
              {Object.keys(filteredPlayersByTeam).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  {Object.keys(playersByTeam).length === 0
                    ? 'No player pool available yet.'
                    : `No players match "${search}".`}
                </div>
              ) : (
                <div className="grid gap-3">
                  {Object.entries(filteredPlayersByTeam).map(([teamName, players], teamIndex) => (
                    <div key={teamName} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      {/* Team header */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50/70">
                        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-medium text-white shrink-0">
                          {teamIndex + 1}
                        </span>
                        <span className="text-[12.5px] font-medium text-slate-800 truncate">{teamName}</span>
                        <span className="ml-auto text-[10px] font-medium text-[#534AB7] bg-[#EEEDFE] px-1.5 py-0.5 rounded-full shrink-0">
                          {players.length}p
                        </span>
                      </div>
                      {/* Player rows */}
                      <div>
                        {players.map((p) => {
                          const key = normalizePlayer(p).toLowerCase();
                          const pickedByMe = myPickedKeys.has(key);
                          const pickedByOpponent = opponentPickedKeys.has(key);
                          const alreadyPicked = allPickedKeys.has(key);
                          return (
                            <div
                              key={`${teamName}:${p}`}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-slate-50 last:border-b-0"
                            >
                              <span className={`text-[13px] truncate ${alreadyPicked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                {p}
                              </span>
                              <button
                                onClick={() => !alreadyPicked && room?.myTurn && !busy && onPick(p)}
                                disabled={busy || !room?.myTurn || alreadyPicked}
                                className={`shrink-0 h-8 min-w-[52px] px-2.5 rounded-lg text-[11px] font-medium border transition-colors disabled:cursor-not-allowed ${
                                  pickedByMe
                                    ? 'bg-[#EEEDFE] text-[#3C3489] border-[rgba(127,119,221,0.3)]'
                                    : pickedByOpponent
                                      ? 'bg-slate-100 text-slate-400 border-transparent'
                                      : room?.myTurn && !busy
                                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                                        : 'bg-slate-100 text-slate-400 border-transparent'
                                }`}
                              >
                                {pickedByMe ? 'Yours' : pickedByOpponent ? 'Opp' : 'Pick'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Captain selection */}
          {status === 'CAPTAIN' && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/70">
                <span className="text-[12.5px] font-medium text-slate-800">Captain selection</span>
              </div>
              <div className="p-3 grid gap-2">
                {captainComplete ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] text-emerald-700">
                      Captains selected. Both users must lock to freeze.
                    </div>
                    {!bothLocked && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-600">
                        Locks — You: {meLocked ? 'Locked' : 'Pending'} · Opponent: {counterpartLocked ? 'Locked' : 'Pending'}
                      </div>
                    )}
                    <Button onClick={onLockSelection} disabled={busy || !canLockSelection || meLocked} fullWidth>
                      {meLocked ? 'Locked ✓' : 'Lock selection'}
                    </Button>
                  </>
                ) : (
                  <>
                    <select
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900"
                      value={captainChoice}
                      onChange={(e) => setCaptainChoice(e.target.value)}
                      disabled={busy || !room?.myTurn}
                    >
                      <option value="">Select captain...</option>
                      {myPlayers.map((p) => (
                        <option key={`cap-${p}`} value={p}>{p}</option>
                      ))}
                    </select>
                    <Button onClick={onSelectCaptain} disabled={busy || !room?.myTurn || !captainChoice} fullWidth>
                      Confirm captain
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  );
};

export default LiveRoomPage;