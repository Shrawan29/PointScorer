import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { copyToClipboard } from '../utils/copyToClipboard.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getEffectiveStatus = (session) => {
  const raw = String(session?.status || '').toUpperCase();
  if (raw === 'COMPLETED' || session?.playedAt) return 'COMPLETED';
  if (raw === 'LIVE' || raw === 'TODAY') return 'LIVE';
  if (raw === 'UPCOMING') return 'UPCOMING';
  return raw || 'UPCOMING';
};

const getStatusBadgeClass = (status) => {
  if (status === 'COMPLETED') return 'bg-slate-100 border-slate-200 text-slate-600';
  if (status === 'LIVE')      return 'bg-slate-100 border-slate-200 text-slate-700';
  if (status === 'UPCOMING')  return 'bg-slate-100 border-slate-200 text-slate-500';
  return 'bg-slate-100 border-slate-200 text-slate-500';
};

const getMatchScoreSummary = (session, userLabel, friendLabel) => {
  const userPoints   = toNumber(session?.userTotalPoints);
  const friendPoints = toNumber(session?.friendTotalPoints);
  const diff         = Math.abs(userPoints - friendPoints);
  const status       = getEffectiveStatus(session);
  const hasAnyScore  = userPoints !== 0 || friendPoints !== 0;

  if (!hasAnyScore && status !== 'COMPLETED') {
    return { userPoints, friendPoints, diff, summary: 'No score yet' };
  }
  if (userPoints === friendPoints) {
    return { userPoints, friendPoints, diff, summary: status === 'COMPLETED' ? 'Match tied' : 'Scores level' };
  }
  const winner = userPoints > friendPoints ? userLabel : friendLabel;
  return {
    userPoints, friendPoints, diff,
    summary: status === 'COMPLETED'
      ? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
      : `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`,
  };
};

// ── Stat box ──────────────────────────────────────────────────────────────────
const StatBox = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</div>
    <div className="text-sm font-bold text-slate-900 leading-snug break-words">{value}</div>
  </div>
);

// ── Session card ──────────────────────────────────────────────────────────────
const SessionCard = ({ s, userDisplayName, friendName, deletingId, onDeleteSession, showResult, isPending }) => {
  const displayStatus = getEffectiveStatus(s);
  const scoreSummary  = getMatchScoreSummary(s, userDisplayName, friendName);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3.5 ${isPending ? 'opacity-70' : ''}`}>
      {/* Top row: name + delete icon */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 leading-snug">{s.realMatchName}</div>
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold mt-1 ${getStatusBadgeClass(displayStatus)}`}>
            {displayStatus}
          </span>
        </div>
        {/* Trash icon button — no red, just a quiet slate icon */}
        <button
          type="button"
          disabled={deletingId === String(s._id)}
          onClick={() => onDeleteSession(s)}
          className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600 hover:border-slate-300 disabled:opacity-40 transition-colors"
          title="Delete session"
        >
          {deletingId === String(s._id) ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Score row */}
      <div className="flex items-center gap-2 text-xs text-slate-600 mt-2 mb-0.5">
        <span>{userDisplayName} <span className="font-bold text-slate-900">{scoreSummary.userPoints}</span></span>
        <span className="text-slate-300">·</span>
        <span>{friendName} <span className="font-bold text-slate-900">{scoreSummary.friendPoints}</span></span>
      </div>
      <div className="text-[11px] text-slate-400 mb-3">{scoreSummary.summary}</div>

      {/* Result button — full width when shown */}
      {showResult && (
        <Link to={`/sessions/${s._id}/result`}>
          <Button variant="secondary" fullWidth>View result</Button>
        </Link>
      )}
    </div>
  );
};

export const FriendDetailPage = () => {
  const { friendId } = useParams();
  const location     = useLocation();
  const { user }     = useAuth();

  const [friend, setFriend]               = useState(null);
  const [sessions, setSessions]           = useState([]);
  const [showPending, setShowPending]     = useState(false);
  const [error, setError]                 = useState('');
  const [info, setInfo]                   = useState('');
  const [loading, setLoading]             = useState(false);
  const [deletingId, setDeletingId]       = useState('');
  const [copyingLink, setCopyingLink]     = useState(false);
  const [friendViewLink, setFriendViewLink] = useState('');

  const friendName      = useMemo(() => friend?.friendName || friendId, [friend, friendId]);
  const userDisplayName = useMemo(() => user?.name || user?.email || 'User', [user]);

  const friendStats = useMemo(() => {
    const list           = Array.isArray(sessions) ? sessions : [];
    const playedSessions = list.filter((s) => String(s?.status || '').toUpperCase() === 'COMPLETED' || Boolean(s?.playedAt));
    const pointsSource   = playedSessions.length > 0 ? playedSessions : list.filter((s) => Boolean(s?.selectionFrozen));
    const userPoints     = pointsSource.reduce((sum, s) => sum + toNumber(s?.userTotalPoints), 0);
    const friendPoints   = pointsSource.reduce((sum, s) => sum + toNumber(s?.friendTotalPoints), 0);
    return { matchesPlayed: playedSessions.length, userPoints, friendPoints, difference: Math.abs(userPoints - friendPoints) };
  }, [sessions]);

  const leadSummary = useMemo(() => {
    const diff = Math.abs(friendStats.userPoints - friendStats.friendPoints);
    if (diff === 0) return 'Level';
    const leader = friendStats.userPoints > friendStats.friendPoints ? userDisplayName : friendName;
    return `${leader} +${diff}`;
  }, [friendStats, userDisplayName, friendName]);

  useEffect(() => {
    const run = async () => {
      setError(''); setFriendViewLink(''); setLoading(true);
      try {
        const [friendsRes, sessionsRes, shareRes] = await Promise.all([
          axiosInstance.get('/api/friends'),
          axiosInstance.get(`/api/matches/friend/${friendId}?onlyFrozen=false&_ts=${Date.now()}`),
          axiosInstance.get(`/api/share/friend-view/${friendId}`).catch(() => null),
        ]);
        const friends = friendsRes.data || [];
        setFriend(friends.find((f) => f._id === friendId) || null);
        setSessions(sessionsRes.data || []);
        setFriendViewLink(shareRes?.data?.url || '');
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load friend details');
      } finally { setLoading(false); }
    };
    run();
  }, [friendId, location.key]);

  const onDeleteSession = async (session) => {
    const sessionId = session?._id;
    if (!sessionId) return;
    const name = session?.realMatchName || 'this match session';
    const ok = window.confirm(`Delete "${name}"? This will remove the session, selections, and results.`);
    if (!ok) return;
    setError('');
    setDeletingId(String(sessionId));
    try {
      await axiosInstance.delete(`/api/matches/session/${sessionId}`);
      setSessions((prev) => (prev || []).filter((s) => String(s?._id) !== String(sessionId)));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete match session');
    } finally { setDeletingId(''); }
  };

  const onCopyFriendViewLink = async () => {
    setError(''); setInfo(''); setCopyingLink(true);
    try {
      let url = friendViewLink;
      if (!url) {
        const res = await axiosInstance.get(`/api/share/friend-view/${friendId}`);
        url = res?.data?.url || '';
        if (url) { setFriendViewLink(url); setInfo('Link is ready. Tap copy again.'); return; }
      }
      if (!url) { setError('Unable to generate friend view link'); return; }
      const copied = await copyToClipboard(url);
      if (!copied) {
        if (navigator?.share) {
          try {
            await navigator.share({ title: `${friendName} match history`, url });
            setInfo('Opened share sheet. Choose Copy or Messages/WhatsApp.');
            return;
          } catch { /* cancelled */ }
        }
        setError('Copy failed. Long-press this link to copy: ' + url);
        return;
      }
      setInfo('Friend view link copied');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to generate friend view link');
    } finally { setCopyingLink(false); }
  };

  const frozen  = (sessions || []).filter((s) => s.selectionFrozen === true);
  const pending = (sessions || []).filter((s) => s.selectionFrozen === false);

  return (
    <Layout>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 leading-tight">{friendName}</h1>
        <p className="mt-0.5 text-xs text-slate-400 mb-3">Rulesets and match sessions for this friend.</p>
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onCopyFriendViewLink} disabled={copyingLink}>
            {copyingLink ? 'Copying…' : 'Copy result link'}
          </Button>
          <Link to={`/friends/${friendId}/rulesets`} className="flex-1">
            <Button variant="secondary" fullWidth>Rulesets</Button>
          </Link>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {info  && <Alert type="success">{info}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4 text-[var(--brand)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading…
        </div>
      ) : (
        <div className="grid gap-5">

          {/* ── Match sessions ────────────────────────────────────────────── */}
          <Card title="Match Sessions">
            <div className="grid gap-4">

              {/* Stats summary */}
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Matches played"           value={friendStats.matchesPlayed} />
                <StatBox label={`${userDisplayName} pts`} value={friendStats.userPoints} />
                <StatBox label={`${friendName} pts`}      value={friendStats.friendPoints} />
                <StatBox label="Standing"                 value={leadSummary} />
              </div>

              {/* Frozen sessions */}
              {frozen.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No frozen sessions yet. Create a session, pick players, then click "Freeze" on the Selection page.
                </p>
              ) : (
                <div className="grid gap-2">
                  {frozen.map((s) => (
                    <SessionCard
                      key={s._id}
                      s={s}
                      userDisplayName={userDisplayName}
                      friendName={friendName}
                      deletingId={deletingId}
                      onDeleteSession={onDeleteSession}
                      showResult
                      isPending={false}
                    />
                  ))}
                </div>
              )}

              {/* Pending toggle */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-400">Show unfreezed</span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setShowPending((v) => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${showPending ? 'bg-slate-700' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-1 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${showPending ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-xs text-slate-600 font-medium">Pending</span>
                </label>
              </div>

              {/* Pending sessions */}
              {showPending && pending.length === 0 && (
                <p className="text-xs text-slate-400">No pending sessions.</p>
              )}
              {showPending && pending.length > 0 && (
                <div className="grid gap-2">
                  {pending.map((s) => (
                    <SessionCard
                      key={s._id}
                      s={s}
                      userDisplayName={userDisplayName}
                      friendName={friendName}
                      deletingId={deletingId}
                      onDeleteSession={onDeleteSession}
                      showResult={false}
                      isPending
                    />
                  ))}
                </div>
              )}

            </div>
          </Card>

        </div>
      )}
    </Layout>
  );
};

export default FriendDetailPage;