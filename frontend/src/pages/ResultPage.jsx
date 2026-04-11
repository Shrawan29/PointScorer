import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const AUTO_REFRESH_INTERVAL_MS = 60_000;
const RESULT_CACHE_TTL_MS = 90_000;

const isCompletedByScorecard = (meta) => {
  const state = String(meta?.scorecardState || '').toUpperCase();
  const status = String(meta?.scorecardStatus || '').toLowerCase();
  return (
    state === 'COMPLETED' ||
    status.includes(' won ') ||
    status.includes(' won by') ||
    status.includes('beat') ||
    status.includes('match tied') ||
    status.includes('match drawn') ||
    status.includes('result')
  );
};

// ── Small stat pill ────────────────────────────────────────────────────────────
const StatPill = ({ label, value, accent }) => (
  <div className={`flex flex-col rounded-xl border px-3 py-2.5 ${accent}`}>
    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">{label}</span>
    <span className="text-sm font-bold leading-tight">{value ?? '—'}</span>
  </div>
);

// ── Points score card (big number) ────────────────────────────────────────────
const ScoreBlock = ({ name, points, captain, isWinner, accentBg, accentText, accentBorder }) => (
  <div className={`flex-1 rounded-xl border-2 px-4 py-4 flex flex-col gap-1 ${accentBorder} ${accentBg}`}>
    <div className={`text-[11px] font-bold uppercase tracking-widest ${accentText} opacity-70`}>{name}</div>
    <div className={`text-4xl font-black tabular-nums leading-none ${accentText}`}>{points ?? 0}</div>
    <div className="text-[11px] text-slate-500 mt-0.5">
      {captain ? <>⭐ {captain}</> : <span className="opacity-50">No captain</span>}
    </div>
    {isWinner && (
      <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 w-fit ${accentText} bg-white/60`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
        Leading
      </div>
    )}
  </div>
);

// ── Player points row ─────────────────────────────────────────────────────────
const PlayerPointRow = ({ label, points, isCaptain, rank, accentClass }) => (
  <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors
    ${isCaptain ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-50'}`}>
    <span className="w-5 text-[11px] font-bold text-slate-300 tabular-nums text-right shrink-0">{rank}</span>
    <div className="flex-1 min-w-0">
      <span className="text-xs sm:text-sm font-medium text-slate-800 truncate block">{label}</span>
      {isCaptain && (
        <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-0.5">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          Captain
        </span>
      )}
    </div>
    <span className={`text-sm font-black tabular-nums shrink-0 ${isCaptain ? 'text-amber-700' : 'text-slate-700'}`}>
      {points}
    </span>
  </div>
);

export const ResultPage = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const resultCacheKey = useMemo(() => `matchResultCacheV1_${sessionId}`, [sessionId]);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [freezingSelection, setFreezingSelection] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMeta, setRefreshMeta] = useState(null);

  const writeResultCache = useCallback(
    (payload) => {
      if (!payload) return;
      try {
        sessionStorage.setItem(resultCacheKey, JSON.stringify({ ts: Date.now(), data: payload }));
      } catch {
        // ignore cache write errors
      }
    },
    [resultCacheKey],
  );

  const fetchResultPayload = useCallback(
    async ({ skipAutoRefresh = false } = {}) => {
      const params = new URLSearchParams();
      params.set('t', String(Date.now()));
      if (skipAutoRefresh) params.set('skipAutoRefresh', '1');
      const res = await axiosInstance.get(`/api/history/match/${sessionId}?${params.toString()}`);
      return res.data;
    },
    [sessionId],
  );

  const userCaptain    = useMemo(() => data?.userCaptain   || data?.captain || null, [data]);
  const friendCaptain  = useMemo(() => data?.friendCaptain || null, [data]);
  const allRows        = useMemo(() => data?.playerWisePoints || [], [data]);
  const userRows       = useMemo(() => allRows.filter((r) => String(r?.team || 'USER') === 'USER'),   [allRows]);
  const friendRows     = useMemo(() => allRows.filter((r) => String(r?.team || 'USER') === 'FRIEND'), [allRows]);

  const friendTeamSelected = useMemo(
    () => Array.isArray(data?.friendPlayers) && data.friendPlayers.length > 0, [data]);
  const canAttemptFix = useMemo(
    () => friendTeamSelected && allRows.length > 0 && friendRows.length === 0,
    [friendTeamSelected, allRows.length, friendRows.length]);

  const userDisplayName   = useMemo(() => user?.name || user?.email || 'User', [user]);
  const friendDisplayName = useMemo(() => data?.friendName || data?.friend?.friendName || 'Friend', [data]);

  const userPoints   = toNumber(data?.userTotalPoints);
  const friendPoints = toNumber(data?.friendTotalPoints);
  const userWins     = userPoints > friendPoints;
  const friendWins   = friendPoints > userPoints;

  const winnerSummary = useMemo(() => {
    if (!data?.selectionFrozen) return 'Freeze selection to start scoring';
    const diff = Math.abs(userPoints - friendPoints);
    const isCompleted =
      data?.match?.status === 'COMPLETED' ||
      data?.matchState === 'COMPLETED' ||
      isCompletedByScorecard(refreshMeta);
    if (userPoints === friendPoints) return isCompleted ? 'Match tied' : 'Scores level';
    const winner = userPoints > friendPoints ? userDisplayName : friendDisplayName;
    return isCompleted
      ? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
      : `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`;
  }, [data, userPoints, friendPoints, userDisplayName, friendDisplayName, refreshMeta]);

  const isCompleted = useMemo(() => {
    const state  = String(data?.matchState    || '').toUpperCase();
    const status = String(data?.match?.status || '').toUpperCase();
    return state === 'COMPLETED' || status === 'COMPLETED';
  }, [data]);

  const isUpcoming = useMemo(() => {
    const state = String(data?.matchState || '').toUpperCase();
    return state === 'UPCOMING' && !isCompleted;
  }, [data, isCompleted]);

  const canRefresh = useMemo(() => Boolean(data?.selectionFrozen), [data]);

  useEffect(() => {
    let cancelled = false;

    const readCache = () => {
      try {
        const raw = sessionStorage.getItem(resultCacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const age = Date.now() - Number(parsed?.ts || 0);
        if (age < 0 || age > RESULT_CACHE_TTL_MS) return null;
        return parsed?.data || null;
      } catch {
        return null;
      }
    };

    const applyPayload = (payload) => {
      if (cancelled || !payload) return;
      setData(payload);
      writeResultCache(payload);
    };

    const run = async () => {
      setError('');
      setInfo('');

      const cachedPayload = readCache();
      if (cachedPayload) {
        applyPayload(cachedPayload);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const quickPayload = await fetchResultPayload({ skipAutoRefresh: true });
        if (cancelled) return;

        applyPayload(quickPayload);
        setLoading(false);

        const payloadStatus = String(quickPayload?.match?.status || '').toUpperCase();
        const isUpcomingWithoutResult =
          String(quickPayload?.matchState || '').toUpperCase() === 'UPCOMING' && payloadStatus !== 'COMPLETED';

        if (isUpcomingWithoutResult) return;

        const hasPoints =
          Array.isArray(quickPayload?.playerWisePoints) && quickPayload.playerWisePoints.length > 0;

        if (!hasPoints) {
          try {
            await axiosInstance.post(`/api/scoring/session/${sessionId}/calculate`);
          } catch (calcErr) {
            if (cancelled) return;
            const msg = calcErr?.response?.data?.message;
            if (msg) setError(msg);
          }
        }

        try {
          const freshPayload = await fetchResultPayload();
          if (cancelled) return;
          applyPayload(freshPayload);
          setError('');
        } catch {
          // Keep quick payload if background freshness request fails.
        }
      } catch (err) {
        if (cancelled) return;
        if (!cachedPayload) setError(err?.response?.data?.message || 'Failed to load result');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [fetchResultPayload, resultCacheKey, sessionId, writeResultCache]);

  useEffect(() => {
    const selectionFrozen  = Boolean(data?.selectionFrozen);
    const shouldAutoRefresh = selectionFrozen && !isCompleted;
    if (!shouldAutoRefresh) return undefined;
    const timer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const payload = await fetchResultPayload();
        setData(payload);
        writeResultCache(payload);
        const payloadStatus = String(payload?.match?.status || '').toUpperCase();
        if (String(payload?.matchState || '').toUpperCase() !== 'UPCOMING' || payloadStatus === 'COMPLETED') setError('');
        setRefreshMeta((prev) => ({ ...(prev || {}), lastRefreshedAt: new Date().toISOString() }));
      } catch { /* ignore polling failures */ }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data?.selectionFrozen, fetchResultPayload, isCompleted, sessionId, writeResultCache]);

  const onFixFriendPoints = async () => {
    setError(''); setInfo(''); setFixing(true);
    try {
      await axiosInstance.post(`/api/scoring/session/${sessionId}/calculate?force=true`);
      const payload = await fetchResultPayload();
      setData(payload);
      writeResultCache(payload);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to recalculate');
    } finally { setFixing(false); }
  };

  const onRefreshStats = async () => {
    setError(''); setInfo(''); setRefreshing(true);
    try {
      const resp = await axiosInstance.post(`/api/scoring/session/${sessionId}/refresh?force=true`);
      if (resp?.data && Array.isArray(resp.data.playerWisePoints)) {
        setData((prev) => prev ? {
          ...prev,
          playerWisePoints:  resp.data.playerWisePoints,
          userTotalPoints:   resp.data.userTotalPoints,
          friendTotalPoints: resp.data.friendTotalPoints,
          totalPoints:       resp.data.totalPoints,
          matchState: resp?.data?.matchStatus === 'COMPLETED' ? 'COMPLETED' : prev?.matchState,
          match: resp?.data?.matchStatus === 'COMPLETED'
            ? { ...(prev?.match || {}), status: 'COMPLETED' }
            : prev?.match,
        } : prev);
      }
      setRefreshMeta({
        lastRefreshedAt: new Date().toISOString(),
        sourceUrl:        resp?.data?.sourceUrl || null,
        statsUpdated:     typeof resp?.data?.statsUpdated  === 'number' ? resp.data.statsUpdated  : null,
        matchedCount:     typeof resp?.data?.matchedCount  === 'number' ? resp.data.matchedCount  : null,
        nonZeroCount:     typeof resp?.data?.nonZeroCount  === 'number' ? resp.data.nonZeroCount  : null,
        unmatchedPlayers: Array.isArray(resp?.data?.unmatchedPlayers)   ? resp.data.unmatchedPlayers : null,
        scorecardState:   resp?.data?.scorecardState  || null,
        scorecardStatus:  resp?.data?.scorecardStatus || null,
      });
      const payload = await fetchResultPayload();
      setData(payload);
      writeResultCache(payload);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to refresh stats');
    } finally { setRefreshing(false); }
  };

  const onFreezeSelection = async () => {
    setError(''); setInfo(''); setFreezingSelection(true);
    try {
      await axiosInstance.post(`/api/player-selections/freeze/${sessionId}`);
      const payload = await fetchResultPayload();
      setData(payload);
      writeResultCache(payload);
      setInfo('Selection frozen. Auto scoring is now enabled.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to freeze selection');
    } finally { setFreezingSelection(false); }
  };

  return (
    <Layout>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Match Result</h1>
          {data?.match?.realMatchName && (
            <p className="mt-0.5 text-xs text-slate-400 truncate max-w-xs">{data.match.realMatchName}</p>
          )}
        </div>
        <Link to={`/sessions/${sessionId}/breakdown`}>
          <Button variant="secondary">Breakdown</Button>
        </Link>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {info  && <Alert type="success" floating>{info}</Alert>}

      {/* Status banners */}
      {!loading && data && !data?.selectionFrozen && (
        <Alert type="error">Selection not frozen yet. Freeze to calculate and auto-refresh points.</Alert>
      )}
      {!loading && data?.selectionFrozen && !isCompleted && (
        <Alert type="success">Auto-refresh enabled — updates every 60 seconds.</Alert>
      )}
      {!loading && isUpcoming && (
        <Alert type="error">Match hasn't started yet.</Alert>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4 text-[var(--brand)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading…
        </div>
      ) : !data ? null : (
        <div className="grid gap-5">

          {/* ── Score summary card ───────────────────────────────────────────── */}
          <Card title="Summary">

            {/* Big score blocks */}
            <div className="flex gap-3 mb-4">
              <ScoreBlock
                name={userDisplayName}
                points={userPoints}
                captain={userCaptain}
                isWinner={userWins}
                accentBg="bg-emerald-50"
                accentText="text-emerald-800"
                accentBorder="border-emerald-300"
              />
              <div className="flex flex-col items-center justify-center px-1 gap-1">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">vs</span>
                {data?.selectionFrozen && (
                  <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                    {Math.abs(userPoints - friendPoints)}pts
                  </span>
                )}
              </div>
              <ScoreBlock
                name={friendDisplayName}
                points={friendPoints}
                captain={friendCaptain}
                isWinner={friendWins}
                accentBg="bg-violet-50"
                accentText="text-violet-800"
                accentBorder="border-violet-300"
              />
            </div>

            {/* Result banner */}
            <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold text-center mb-4
              ${isCompleted
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
              {winnerSummary}
            </div>

            {/* Freeze CTA */}
            {!data?.selectionFrozen && (
              <Button onClick={onFreezeSelection} disabled={freezingSelection} fullWidth>
                {freezingSelection ? 'Freezing…' : 'Freeze selection to start scoring'}
              </Button>
            )}

            {/* Meta details — collapsible-feel grid */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatPill
                label="Last refreshed"
                value={refreshMeta?.lastRefreshedAt
                  ? new Date(refreshMeta.lastRefreshedAt).toLocaleTimeString()
                  : '—'}
                accent="border-slate-200 bg-slate-50 text-slate-700"
              />
              {typeof refreshMeta?.statsUpdated === 'number' && (
                <StatPill
                  label="Players updated"
                  value={refreshMeta.statsUpdated}
                  accent="border-slate-200 bg-slate-50 text-slate-700"
                />
              )}
              {typeof refreshMeta?.matchedCount === 'number' && (
                <StatPill
                  label="Matched players"
                  value={refreshMeta.matchedCount}
                  accent="border-slate-200 bg-slate-50 text-slate-700"
                />
              )}
              {typeof refreshMeta?.nonZeroCount === 'number' && (
                <StatPill
                  label="Non-zero stats"
                  value={refreshMeta.nonZeroCount}
                  accent="border-slate-200 bg-slate-50 text-slate-700"
                />
              )}
              {(refreshMeta?.scorecardState || refreshMeta?.scorecardStatus) && (
                <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scorecard</span>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    {refreshMeta?.scorecardState || '—'}
                    {refreshMeta?.scorecardStatus ? ` · ${refreshMeta.scorecardStatus}` : ''}
                  </p>
                </div>
              )}
              {refreshMeta?.sourceUrl && (
                <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scorecard source</span>
                  <a
                    href={refreshMeta.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs font-medium text-[var(--brand)] hover:underline mt-0.5 truncate"
                  >
                    {refreshMeta.sourceUrl}
                  </a>
                </div>
              )}
            </div>

            {/* Unmatched warning */}
            {Array.isArray(refreshMeta?.unmatchedPlayers) && refreshMeta.unmatchedPlayers.length > 0 && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <svg className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs text-amber-800">
                  {refreshMeta.unmatchedPlayers.length} selected player{refreshMeta.unmatchedPlayers.length !== 1 ? 's' : ''} not yet found in the scorecard.
                </p>
              </div>
            )}

            {/* Friend team missing warning */}
            {!friendTeamSelected && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <svg className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs text-amber-800">
                  Friend team not selected. Go to Selection, pick friend players + captain, then Save and Freeze.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-4 flex flex-col gap-2">
              {canAttemptFix && (
                <Button variant="secondary" onClick={onFixFriendPoints} disabled={fixing} fullWidth>
                  {fixing ? 'Fixing…' : 'Fix friend points'}
                </Button>
              )}
              {canRefresh && (
                <Button onClick={onRefreshStats} disabled={refreshing} fullWidth>
                  {refreshing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Refreshing…
                    </span>
                  ) : 'Refresh stats & recalc'}
                </Button>
              )}
            </div>
          </Card>

          {/* ── User player points ───────────────────────────────────────────── */}
          <Card title={`${userDisplayName}'s points`}>
            {!data?.selectionFrozen ? (
              <p className="text-xs sm:text-sm text-slate-500">Points will appear after selection is frozen.</p>
            ) : userRows.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-500">No points found.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {/* Header row */}
                <div className="flex items-center gap-2.5 px-3 py-1.5 mb-1">
                  <span className="w-5" />
                  <span className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Player</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">Pts</span>
                </div>
                {userRows
                  .slice()
                  .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
                  .map((r, idx) => {
                    const isCaptain = userCaptain && String(r.playerId) === String(userCaptain);
                    const label     = String(r?.playerId || r?.playerName || 'Unknown player');
                    const pts       = typeof r?.totalPoints === 'number' ? r.totalPoints : 0;
                    return (
                      <PlayerPointRow
                        key={r._id || `USER:${label}:${idx}`}
                        label={label}
                        points={pts}
                        isCaptain={isCaptain}
                        rank={idx + 1}
                        accentClass="text-emerald-700"
                      />
                    );
                  })}
                {/* Total row */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 px-3">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Total</span>
                  <span className="text-sm font-black text-emerald-700 tabular-nums">{userPoints}</span>
                </div>
              </div>
            )}
          </Card>

          {/* ── Friend player points ─────────────────────────────────────────── */}
          <Card title={`${friendDisplayName}'s points`}>
            {!data?.selectionFrozen ? (
              <p className="text-xs sm:text-sm text-slate-500">Points will appear after selection is frozen.</p>
            ) : friendRows.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-500">No points found.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {/* Header row */}
                <div className="flex items-center gap-2.5 px-3 py-1.5 mb-1">
                  <span className="w-5" />
                  <span className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Player</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">Pts</span>
                </div>
                {friendRows
                  .slice()
                  .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
                  .map((r, idx) => {
                    const isCaptain = friendCaptain && String(r.playerId) === String(friendCaptain);
                    const label     = String(r?.playerId || r?.playerName || 'Unknown player');
                    const pts       = typeof r?.totalPoints === 'number' ? r.totalPoints : 0;
                    return (
                      <PlayerPointRow
                        key={r._id || `FRIEND:${label}:${idx}`}
                        label={label}
                        points={pts}
                        isCaptain={isCaptain}
                        rank={idx + 1}
                        accentClass="text-violet-700"
                      />
                    );
                  })}
                {/* Total row */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 px-3">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Total</span>
                  <span className="text-sm font-black text-violet-700 tabular-nums">{friendPoints}</span>
                </div>
              </div>
            )}
          </Card>

        </div>
      )}
    </Layout>
  );
};

export default ResultPage;