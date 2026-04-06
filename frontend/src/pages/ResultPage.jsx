import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const AUTO_REFRESH_INTERVAL_MS = 60_000;

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

export const ResultPage = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [freezingSelection, setFreezingSelection] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMeta, setRefreshMeta] = useState(null);

  const userCaptain = useMemo(() => data?.userCaptain || data?.captain || null, [data]);
  const friendCaptain = useMemo(() => data?.friendCaptain || null, [data]);
  const allRows = useMemo(() => data?.playerWisePoints || [], [data]);
  const userRows = useMemo(
    () => allRows.filter((r) => String(r?.team || 'USER') === 'USER'),
    [allRows]
  );
  const friendRows = useMemo(
    () => allRows.filter((r) => String(r?.team || 'USER') === 'FRIEND'),
    [allRows]
  );

  const friendTeamSelected = useMemo(
    () => Array.isArray(data?.friendPlayers) && data.friendPlayers.length > 0,
    [data]
  );
  const canAttemptFix = useMemo(
    () => friendTeamSelected && allRows.length > 0 && friendRows.length === 0,
    [friendTeamSelected, allRows.length, friendRows.length]
  );

  const userDisplayName = useMemo(() => user?.name || user?.email || 'User', [user]);
  const friendDisplayName = useMemo(
    () => data?.friendName || data?.friend?.friendName || 'Friend',
    [data]
  );

  const winnerSummary = useMemo(() => {
    if (!data?.selectionFrozen) {
      return 'Freeze selection to start scoring';
    }

    const userPoints = toNumber(data?.userTotalPoints);
    const friendPoints = toNumber(data?.friendTotalPoints);
    const diff = Math.abs(userPoints - friendPoints);
    const isCompleted =
      data?.match?.status === 'COMPLETED' ||
      data?.matchState === 'COMPLETED' ||
      isCompletedByScorecard(refreshMeta);

    if (userPoints === friendPoints) {
      return isCompleted ? 'Match tied' : 'Scores level';
    }

    const winner = userPoints > friendPoints ? userDisplayName : friendDisplayName;
    return isCompleted
      ? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
      : `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`;
  }, [data, userDisplayName, friendDisplayName, refreshMeta]);

  const isCompleted = useMemo(() => {
    const state = String(data?.matchState || '').toUpperCase();
    const status = String(data?.match?.status || '').toUpperCase();
    return state === 'COMPLETED' || status === 'COMPLETED';
  }, [data]);

  const isUpcoming = useMemo(() => {
    const state = String(data?.matchState || '').toUpperCase();
    return state === 'UPCOMING' && !isCompleted;
  }, [data, isCompleted]);

	const canRefresh = useMemo(
    () => Boolean(data?.selectionFrozen),
    [data]
	);

  useEffect(() => {
    const run = async () => {
      setError('');
      setInfo('');
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
        const payload = res.data;

      const payloadStatus = String(payload?.match?.status || '').toUpperCase();
      if (payload?.matchState === 'UPCOMING' && payloadStatus !== 'COMPLETED') {
				setData(payload);
        setError('');
				return;
			}
      setError('');

        // If points aren't calculated yet, attempt calculation once and refetch.
        if (Array.isArray(payload?.playerWisePoints) && payload.playerWisePoints.length === 0) {
          try {
            await axiosInstance.post(`/api/scoring/session/${sessionId}/calculate`);
            const again = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
            setData(again.data);
            return;
          } catch (calcErr) {
            // Common case: selection not frozen yet.
            const msg = calcErr?.response?.data?.message;
            if (msg) {
              setError(msg);
            }
          }
        }

        setData(payload);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load result');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [sessionId]);

  useEffect(() => {
    const selectionFrozen = Boolean(data?.selectionFrozen);
    const shouldAutoRefresh = selectionFrozen && !isCompleted;
    if (!shouldAutoRefresh) return undefined;

    const timer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
        setData(res.data);
        const payloadStatus = String(res?.data?.match?.status || '').toUpperCase();
        if (String(res?.data?.matchState || '').toUpperCase() !== 'UPCOMING' || payloadStatus === 'COMPLETED') {
          setError('');
        }
        setRefreshMeta((prev) => ({
          ...(prev || {}),
          lastRefreshedAt: new Date().toISOString(),
        }));
      } catch {
        // Ignore transient polling failures; manual refresh remains available.
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [data?.selectionFrozen, isCompleted, sessionId]);

  const onFixFriendPoints = async () => {
    setError('');
    setInfo('');
    setFixing(true);
    try {
      await axiosInstance.post(`/api/scoring/session/${sessionId}/calculate?force=true`);
      const again = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
      setData(again.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to recalculate');
    } finally {
      setFixing(false);
    }
  };

  const onRefreshStats = async () => {
    setError('');
    setInfo('');
    setRefreshing(true);
    try {
      const resp = await axiosInstance.post(`/api/scoring/session/${sessionId}/refresh?force=true`);
      // Optimistically update points from refresh response so UI updates immediately.
      if (resp?.data && Array.isArray(resp.data.playerWisePoints)) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                playerWisePoints: resp.data.playerWisePoints,
                userTotalPoints: resp.data.userTotalPoints,
                friendTotalPoints: resp.data.friendTotalPoints,
                totalPoints: resp.data.totalPoints,
                matchState: resp?.data?.matchStatus === 'COMPLETED' ? 'COMPLETED' : prev?.matchState,
                match:
                  resp?.data?.matchStatus === 'COMPLETED'
                    ? { ...(prev?.match || {}), status: 'COMPLETED' }
                    : prev?.match,
              }
            : prev
        );
      }
      setRefreshMeta({
        lastRefreshedAt: new Date().toISOString(),
        sourceUrl: resp?.data?.sourceUrl || null,
        statsUpdated: typeof resp?.data?.statsUpdated === 'number' ? resp.data.statsUpdated : null,
        matchedCount: typeof resp?.data?.matchedCount === 'number' ? resp.data.matchedCount : null,
        nonZeroCount: typeof resp?.data?.nonZeroCount === 'number' ? resp.data.nonZeroCount : null,
        unmatchedPlayers: Array.isArray(resp?.data?.unmatchedPlayers) ? resp.data.unmatchedPlayers : null,
        scorecardState: resp?.data?.scorecardState || null,
        scorecardStatus: resp?.data?.scorecardStatus || null,
      });
      const again = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
      setData(again.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to refresh stats');
    } finally {
      setRefreshing(false);
    }
  };

  const onFreezeSelection = async () => {
    setError('');
    setInfo('');
    setFreezingSelection(true);
    try {
      await axiosInstance.post(`/api/player-selections/freeze/${sessionId}`);
      const again = await axiosInstance.get(`/api/history/match/${sessionId}?t=${Date.now()}`);
      setData(again.data);
      setInfo('Selection frozen. Auto scoring is now enabled.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to freeze selection');
    } finally {
      setFreezingSelection(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Match Result"
        subtitle={data?.match?.realMatchName || ''}
        actions={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Link to={`/sessions/${sessionId}/breakdown`} className="flex-1 sm:flex-none">
              <Button variant="secondary" fullWidth>Breakdown</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {info && <Alert type="success">{info}</Alert>}

      {!loading && data && !data?.selectionFrozen ? (
        <Alert type="error">
          Selection is not frozen yet. Freeze selection to calculate and auto-refresh points.
        </Alert>
      ) : null}

      {!loading && data?.selectionFrozen && !isCompleted ? (
        <Alert type="success">Auto-refresh is enabled (every 60 seconds).</Alert>
      ) : null}

      {!loading && isUpcoming ? (
        <Alert type="error">Match not started yet</Alert>
      ) : null}

      {loading ? (
        <div className="text-xs sm:text-sm text-slate-600">Loading...</div>
      ) : !data ? null : (
        <div className="grid gap-4">
          <Card title="Summary">
          <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-700">{userDisplayName} captain: {userCaptain || 'N/A'}</div>
          <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-700">{friendDisplayName} captain: {friendCaptain || 'N/A'}</div>
          <div className="mt-1 rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-700">{userDisplayName} points: {data.userTotalPoints ?? 0}</div>
          <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-700">{friendDisplayName} points: {data.friendTotalPoints ?? 0}</div>
          <div className="mt-1 rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-700">Result: {winnerSummary}</div>

      {!data?.selectionFrozen ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={onFreezeSelection} disabled={freezingSelection} fullWidth>
            {freezingSelection ? 'Freezing...' : 'Freeze selection to start scoring'}
          </Button>
        </div>
      ) : null}

      <div className="mt-2 rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm">
        <span className="text-slate-700">Last refreshed: </span>
        <span className={refreshMeta?.lastRefreshedAt ? 'text-slate-700' : 'text-slate-500'}>
          {refreshMeta?.lastRefreshedAt
            ? new Date(refreshMeta.lastRefreshedAt).toLocaleString()
            : '—'}
        </span>
        {typeof refreshMeta?.statsUpdated === 'number' ? (
          <span className="text-slate-500"> ({refreshMeta.statsUpdated} players updated)</span>
        ) : null}
      </div>

      {refreshMeta?.scorecardState || refreshMeta?.scorecardStatus ? (
        <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-600">
          <span>Scorecard: </span>
          <span>
            {refreshMeta?.scorecardState ? String(refreshMeta.scorecardState) : '—'}
            {refreshMeta?.scorecardStatus ? ` • ${String(refreshMeta.scorecardStatus)}` : ''}
          </span>
        </div>
      ) : null}

      {typeof refreshMeta?.matchedCount === 'number' || typeof refreshMeta?.nonZeroCount === 'number' ? (
        <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm text-slate-600">
          <span>Matched players: </span>
          <span>{typeof refreshMeta?.matchedCount === 'number' ? refreshMeta.matchedCount : '—'}</span>
          <span> • Non-zero stats: </span>
          <span>{typeof refreshMeta?.nonZeroCount === 'number' ? refreshMeta.nonZeroCount : '—'}</span>
        </div>
      ) : null}

      {Array.isArray(refreshMeta?.unmatchedPlayers) && refreshMeta.unmatchedPlayers.length > 0 ? (
        <div className="text-xs sm:text-sm text-amber-700">
          Some selected players were not found in the scorecard yet ({refreshMeta.unmatchedPlayers.length}).
        </div>
      ) : null}
      <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm break-all">
        <span className="text-slate-700">Scorecard source: </span>
        {refreshMeta?.sourceUrl ? (
          <a
            href={refreshMeta.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--brand)] hover:underline"
          >
            {refreshMeta.sourceUrl}
          </a>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </div>
      {!friendTeamSelected ? (
        <div className="mt-2 text-xs sm:text-sm text-amber-700">
          Friend team is not selected for this session. Go to Selection and pick friend players + captain,
          then Save and Freeze.
        </div>
      ) : null}
      {canAttemptFix ? (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={onFixFriendPoints} disabled={fixing} fullWidth>
            {fixing ? 'Fixing…' : 'Fix friend points'}
          </Button>
        </div>
      ) : null}
      {canRefresh ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={onRefreshStats} disabled={refreshing} fullWidth>
            {refreshing ? 'Refreshing…' : 'Refresh stats & recalc'}
          </Button>
        </div>
      ) : null}
          </Card>

      <Card title={`${userDisplayName} player points`}>
        {!data?.selectionFrozen ? (
          <div className="text-xs sm:text-sm text-slate-600">Points will appear after selection is frozen.</div>
        ) : userRows.length === 0 ? (
          <div className="text-xs sm:text-sm text-slate-600">No points found.</div>
        ) : (
          <div className="grid gap-2.5">
            {userRows
              .slice()
              .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
              .map((r, idx) => {
                const isCaptain = userCaptain && String(r.playerId) === String(userCaptain);
                const playerLabel = String(r?.playerId || r?.playerName || 'Unknown player');
                const playerPoints = typeof r?.totalPoints === 'number' ? r.totalPoints : 0;
                return (
                  <div key={r._id || `USER:${playerLabel}:${idx}`} className="flex items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2 text-xs sm:text-sm">
                    <div className="font-medium text-slate-900">
                      {playerLabel}
                      {isCaptain ? <span className="text-xs text-slate-600"> (Captain)</span> : null}
                    </div>
                    <div className={`font-semibold ${isCaptain ? 'text-slate-900' : 'text-slate-700'}`}>
                      {playerPoints}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      <Card title={`${friendDisplayName} player points`}>
        {!data?.selectionFrozen ? (
          <div className="text-sm text-slate-600">Points will appear after selection is frozen.</div>
        ) : friendRows.length === 0 ? (
          <div className="text-sm text-slate-600">No points found.</div>
        ) : (
          <div className="grid gap-2.5">
            {friendRows
              .slice()
              .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
              .map((r, idx) => {
                const isCaptain = friendCaptain && String(r.playerId) === String(friendCaptain);
                const playerLabel = String(r?.playerId || r?.playerName || 'Unknown player');
                const playerPoints = typeof r?.totalPoints === 'number' ? r.totalPoints : 0;
                return (
                  <div key={r._id || `FRIEND:${playerLabel}:${idx}`} className="flex items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2">
                    <div className="font-medium text-slate-900">
                      {playerLabel}
                      {isCaptain ? <span className="text-xs text-slate-600"> (Captain)</span> : null}
                    </div>
                    <div className={`font-semibold ${isCaptain ? 'text-slate-900' : 'text-slate-700'}`}>
                      {playerPoints}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
        </div>
      )}
    </Layout>
  );
};

export default ResultPage;
