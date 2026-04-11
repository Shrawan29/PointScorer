import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const LiveRoomCreatePage = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const [rulesetId, setRulesetId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [firstTurnBy, setFirstTurnBy] = useState('ME');

  const rulesets = useMemo(() => (Array.isArray(options?.rulesets) ? options.rulesets : []), [options]);
  const matches = useMemo(() => (Array.isArray(options?.matches) ? options.matches : []), [options]);
  const selectedMatch = useMemo(() => matches.find((m) => String(m?.matchId) === String(matchId)) || null, [matches, matchId]);
  const hasActiveRoom = Boolean(options?.activeRoomId);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get(`/api/live-rooms/options/${friendId}`);
        if (cancelled) return;

        const payload = res?.data || null;
        setOptions(payload);

        const defaultRuleset = Array.isArray(payload?.rulesets) && payload.rulesets.length > 0
          ? String(payload.rulesets[0]._id)
          : '';
        const defaultMatch = Array.isArray(payload?.matches) && payload.matches.length > 0
          ? String(payload.matches[0].matchId)
          : '';

        setRulesetId(defaultRuleset);
        setMatchId(defaultMatch);
        setFirstTurnBy('ME');
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load live room options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [friendId]);

  const onCreate = async () => {
    if (!rulesetId || !matchId || !selectedMatch) return;

    setCreating(true);
    setError('');
    try {
      const res = await axiosInstance.post('/api/live-rooms', {
        friendId,
        rulesetId,
        realMatchId: matchId,
        realMatchName: selectedMatch.matchName,
        firstTurnBy,
      });

      const roomId = res?.data?._id;
      if (!roomId) {
        setError('Live room created but roomId is missing');
        return;
      }

      navigate(`/live-rooms/${roomId}`, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create live room');
    } finally {
      setCreating(false);
    }
  };

  const canCreate = Boolean(
    options &&
      !hasActiveRoom &&
      rulesetId &&
      matchId &&
      selectedMatch &&
      options?.counterpartOnline
  );

  return (
    <Layout>
      <PageHeader
        title="Create Live Room"
        subtitle="Both players must be online and ready. Live room auto-ends after 5 minutes."
        actions={
          <Link to="/friends?tab=active">
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error ? <Alert type="error">{error}</Alert> : null}

      {loading ? (
        <div className="text-sm text-slate-600">Loading options...</div>
      ) : !options ? null : (
        <div className="grid gap-4">
          {hasActiveRoom ? (
            <Alert>
              You already have an active room for this linked friend.
              <div className="mt-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/live-rooms/${options.activeRoomId}`)}
                  fullWidth
                >
                  Open active room ({options.activeRoomStatus || 'LOBBY'})
                </Button>
              </div>
            </Alert>
          ) : null}

          <Card title="Linked Friend">
            <div className="text-sm text-slate-800 font-semibold">{options.friendName || 'Friend'}</div>
            <div className="text-xs text-slate-500 mt-1">
              Status: {options.counterpartOnline ? 'Online' : 'Offline'}
            </div>
          </Card>

          <Card title="Select Ruleset">
            {rulesets.length === 0 ? (
              <div className="text-sm text-slate-600">No rulesets found for this linked friend.</div>
            ) : (
              <select
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900"
                value={rulesetId}
                onChange={(e) => setRulesetId(e.target.value)}
              >
                {rulesets.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.rulesetName}
                  </option>
                ))}
              </select>
            )}
          </Card>

          <Card title="Select Match">
            {matches.length === 0 ? (
              <div className="text-sm text-slate-600">No matches available right now.</div>
            ) : (
              <select
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900"
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
              >
                {matches.map((m) => (
                  <option key={`${m.matchId}-${m.matchName}`} value={m.matchId}>
                    {m.matchName} ({m.matchStatus || 'NA'})
                  </option>
                ))}
              </select>
            )}
          </Card>

          <Card title="Who Picks First?">
            <select
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900"
              value={firstTurnBy}
              onChange={(e) => setFirstTurnBy(e.target.value)}
            >
              <option value="ME">You pick first</option>
              <option value="OPPONENT">{options.friendName || 'Friend'} picks first</option>
            </select>
          </Card>

          <Button onClick={onCreate} disabled={!canCreate || creating} fullWidth>
            {creating ? 'Creating...' : 'Create Live Room'}
          </Button>
        </div>
      )}
    </Layout>
  );
};

export default LiveRoomCreatePage;
