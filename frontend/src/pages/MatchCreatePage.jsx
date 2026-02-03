import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const MatchCreatePage = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();

  const [rulesets, setRulesets] = useState([]);
  const [rulesetId, setRulesetId] = useState('');
  const [realMatchId, setRealMatchId] = useState('');
  const [realMatchName, setRealMatchName] = useState('');
  const [matchList, setMatchList] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const canCreate = useMemo(
    () => Boolean(rulesetId && realMatchId.trim() && realMatchName.trim()),
    [rulesetId, realMatchId, realMatchName]
  );

  useEffect(() => {
    const run = async () => {
      setError('');
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/rulesets/friend/${friendId}`);
        const list = res.data || [];
        setRulesets(list);
        if (list.length > 0) setRulesetId(list[0]._id);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load rulesets');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [friendId]);

  const tryFetchMatches = async () => {
    setError('');
    try {
      const res = await axiosInstance.get('/api/cricket/matches');
      setMatchList(res.data || []);
    } catch {
      setError('Match list endpoint not available. Enter match id/name manually.');
      setMatchList([]);
    }
  };

  const extractMatchId = (value) => {
    if (!value) return null;
    const s = String(value);
    const m = s.match(/\/live-cricket-scores\/(\d+)\//i) || s.match(/\/cricket-scores\/(\d+)\//i);
    return m?.[1] || null;
  };

  const onCreate = async () => {
    if (!canCreate) return;
    setError('');
    setCreating(true);

    try {
      const res = await axiosInstance.post('/api/matches', {
        friendId,
        rulesetId,
        realMatchId,
        realMatchName,
      });
      navigate(`/sessions/${res.data._id}/selection`, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Create Match Session"
        subtitle="Creates a MatchSession that references a ruleset."
        actions={
          <Link to={`/friends/${friendId}`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4">
        <Card title="Pick ruleset">
          {loading ? (
            <div className="text-sm text-slate-600">Loading...</div>
          ) : rulesets.length === 0 ? (
            <div className="text-sm text-slate-600">
              No rulesets available. <Link className="underline" to={`/friends/${friendId}/rulesets/new`}>Create one</Link>.
            </div>
          ) : (
            <label className="block">
              <div className="text-sm font-medium text-slate-700 mb-1">Ruleset</div>
              <select
                value={rulesetId}
                onChange={(e) => setRulesetId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                {rulesets.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.rulesetName}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Card>

        <Card
          title="Select real match"
          actions={
            <Button variant="secondary" onClick={tryFetchMatches}>
              Fetch matches
            </Button>
          }
        >
          {matchList.length > 0 && (
            <div className="mb-3">
              <div className="text-sm text-slate-600 mb-2">Select from backend list:</div>
              <select
                className="w-full px-3 py-2 border rounded-md bg-white"
                onChange={(e) => {
                  const picked = matchList.find((m) => String(m.matchUrl) === e.target.value);
                  if (picked) {
                    setRealMatchId(extractMatchId(picked.matchUrl) || '');
                    setRealMatchName(picked.matchName || '');
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a match
                </option>
                {matchList.map((m) => (
                  <option key={m.matchUrl} value={String(m.matchUrl)}>
                    {m.matchName || m.matchUrl}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3">
            <FormField label="Real match ID" value={realMatchId} onChange={setRealMatchId} />
            <FormField label="Real match name" value={realMatchName} onChange={setRealMatchName} />
          </div>
        </Card>

        <div>
          <Button onClick={onCreate} disabled={!canCreate || creating}>
            {creating ? 'Creating...' : 'Create session'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default MatchCreatePage;
