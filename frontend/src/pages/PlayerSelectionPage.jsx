import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const uniqueStrings = (arr) => {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = String(v || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

const clampPlayers = (arr) => uniqueStrings(arr).slice(0, 9);

export const PlayerSelectionPage = () => {
  const { sessionId } = useParams();

  const [selection, setSelection] = useState(null);
  const [session, setSession] = useState(null);
	const [friendName, setFriendName] = useState('Friend');
  const [squads, setSquads] = useState(null);

  const [userPlayers, setUserPlayers] = useState([]);
  const [friendPlayers, setFriendPlayers] = useState([]);
  const [userCaptain, setUserCaptain] = useState('');
  const [friendCaptain, setFriendCaptain] = useState('');

  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freezing, setFreezing] = useState(false);

  const isFrozen = Boolean(selection?.isFrozen);

	const availablePlayers = useMemo(() => {
		const list = squads?.playingXI?.length ? squads.playingXI : squads?.players || [];
		const q = search.trim().toLowerCase();
		if (!q) return list;
		return list.filter((p) => String(p).toLowerCase().includes(q));
	}, [squads, search]);

	const countsOk = useMemo(() => {
		const u = userPlayers.length;
		const f = friendPlayers.length;
		return u >= 6 && u <= 9 && f >= 6 && f <= 9;
	}, [userPlayers, friendPlayers]);

  const load = async () => {
  const [sessionRes, selectionRes] = await Promise.all([
    axiosInstance.get(`/api/matches/session/${sessionId}`),
    axiosInstance.get(`/api/player-selections/${sessionId}`).catch((err) => {
      if (err?.response?.status === 404) return { data: null };
      throw err;
    }),
  ]);

  setSession(sessionRes.data || null);
  setSelection(selectionRes.data || null);

  // Load friend name for labels
  try {
    const fid = sessionRes.data?.friendId;
    if (fid) {
      const friendsRes = await axiosInstance.get('/api/friends');
      const list = friendsRes.data || [];
      const fr = list.find((f) => String(f?._id) === String(fid));
      setFriendName(fr?.friendName || 'Friend');
    }
  } catch {
    setFriendName('Friend');
  }

  const s = selectionRes.data;
  const up = Array.isArray(s?.userPlayers) && s.userPlayers.length > 0 ? s.userPlayers : s?.selectedPlayers || [];
  const fp = s?.friendPlayers || [];
  setUserPlayers(uniqueStrings(up));
  setFriendPlayers(uniqueStrings(fp));
  setUserCaptain(s?.userCaptain || s?.captain || '');
  setFriendCaptain(s?.friendCaptain || '');

  const realMatchId = sessionRes.data?.realMatchId;
  if (realMatchId) {
    try {
      const squadsRes = await axiosInstance.get(`/api/cricket/matches/${realMatchId}/squads`);
      setSquads(squadsRes.data || null);
    } catch {
      setSquads(null);
    }
  }
  };

  useEffect(() => {
    setError('');
    setInfo('');
    setLoading(true);
    load()
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load selection'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const onSave = async () => {
    setError('');
    setInfo('');

	if (!countsOk) {
		setError('Pick 6 to 9 players for both you and your friend');
		return;
	}
	if (!userCaptain || !userPlayers.includes(userCaptain)) {
		setError('Select your captain (must be in your team)');
		return;
	}
	if (!friendCaptain || !friendPlayers.includes(friendCaptain)) {
		setError("Select friend's captain (must be in friend's team)");
		return;
	}

    setSaving(true);
    try {
      const res = await axiosInstance.post('/api/player-selections', {
        sessionId,
		userPlayers: clampPlayers(userPlayers),
		userCaptain,
		friendPlayers: clampPlayers(friendPlayers),
		friendCaptain,
      });
      setSelection(res.data);
      setInfo('Saved');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save selection');
    } finally {
      setSaving(false);
    }
  };

  const onFreeze = async () => {
    setError('');
    setInfo('');
    setFreezing(true);

    try {
      const res = await axiosInstance.post(`/api/player-selections/freeze/${sessionId}`);
      setSelection(res.data);
      setInfo('Selection frozen. It can no longer be edited.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to freeze selection');
    } finally {
      setFreezing(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Player Selection"
        subtitle="Once frozen, selection is immutable."
        actions={
          <div className="flex gap-2">
            <Link to={`/sessions/${sessionId}/result`}>
              <Button variant="secondary">Result</Button>
            </Link>
            <Link to={`/sessions/${sessionId}/share`}>
              <Button variant="secondary">Share</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {info && <Alert type="success">{info}</Alert>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading...</div>
      ) : (
        <div className="grid gap-4">
          <Card title="Selected players">
            <div className="text-sm text-slate-600 mb-2">
              Pick 6–9 players for you and your friend. If Playing XI is available, it will be used.
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700 mb-1">Search players</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  disabled={isFrozen}
                  className="w-full px-3 py-2 border rounded-md bg-white disabled:bg-slate-100"
                />
                <div className="mt-3 max-h-64 overflow-auto border rounded-md">
                  {availablePlayers.length === 0 ? (
                    <div className="p-3 text-sm text-slate-600">No players found.</div>
                  ) : (
                    <div className="divide-y">
                      {availablePlayers.map((p) => {
									const inUser = userPlayers.includes(p);
									const inFriend = friendPlayers.includes(p);
									return (
										<div key={p} className="p-2 flex items-center justify-between gap-2">
											<div className="text-sm text-slate-900 truncate">{p}</div>
											<div className="flex gap-2">
												<button
													type="button"
													disabled={isFrozen || (inFriend && !inUser) || (!inUser && userPlayers.length >= 9)}
													onClick={() => {
														setUserPlayers((prev) =>
															prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
														);
												}}
												className={`px-2 py-1 rounded-md text-xs border ${
													inUser
														? 'bg-slate-900 text-white border-slate-900'
														: 'bg-white text-slate-700 border-slate-200'
												}`}
											>
												Me
											</button>
											<button
												type="button"
												disabled={isFrozen || (inUser && !inFriend) || (!inFriend && friendPlayers.length >= 9)}
												onClick={() => {
													setFriendPlayers((prev) =>
														prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
												);
											}}
											className={`px-2 py-1 rounded-md text-xs border ${
												inFriend
													? 'bg-emerald-600 text-white border-emerald-600'
													: 'bg-white text-slate-700 border-slate-200'
											}`}
											>
											Friend
										</button>
										</div>
									</div>
								);
							})}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700">My team ({userPlayers.length}/9)</div>
                <div className="text-xs text-slate-600 mb-2">Pick 6–9</div>
                <div className="text-sm text-slate-900 min-h-10">
                  {userPlayers.length === 0 ? '—' : userPlayers.join(', ')}
                </div>

                <div className="mt-3 text-sm font-medium text-slate-700">{friendName} team ({friendPlayers.length}/9)</div>
                <div className="text-xs text-slate-600 mb-2">Pick 6–9</div>
                <div className="text-sm text-slate-900 min-h-10">
                  {friendPlayers.length === 0 ? '—' : friendPlayers.join(', ')}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Captains">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">My captain</div>
                <select
                  value={userCaptain}
                  onChange={(e) => setUserCaptain(e.target.value)}
                  disabled={isFrozen}
                  className="w-full px-3 py-2 border rounded-md bg-white disabled:bg-slate-100"
                >
                  <option value="">Select captain</option>
                  {userPlayers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">{friendName} captain</div>
                <select
                  value={friendCaptain}
                  onChange={(e) => setFriendCaptain(e.target.value)}
                  disabled={isFrozen}
                  className="w-full px-3 py-2 border rounded-md bg-white disabled:bg-slate-100"
                >
                  <option value="">Select captain</option>
                  {friendPlayers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button onClick={onSave} disabled={saving || isFrozen}>
              {saving ? 'Saving...' : selection ? 'Update selection' : 'Create selection'}
            </Button>
            <Button variant="secondary" onClick={onFreeze} disabled={freezing || isFrozen || !selection}>
              {freezing ? 'Freezing...' : 'Freeze'}
            </Button>
          </div>

          {isFrozen && <Alert>Selection is frozen. UI is read-only.</Alert>}
        </div>
      )}
    </Layout>
  );
};

export default PlayerSelectionPage;
