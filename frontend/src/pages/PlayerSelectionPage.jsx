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
  const [captainEnabled, setCaptainEnabled] = useState(false);

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

	// Group players by team
	const playersByTeam = useMemo(() => {
		const grouped = {};
		const list = squads?.playingXI?.length ? squads.playingXI : squads?.players || [];
		
		// Use team1 and team2 from squads (country codes like IND, AUS)
		if (squads?.team1 && squads?.team2) {
			grouped[squads.team1] = list;
			grouped[squads.team2] = list;
		} else if (Array.isArray(squads?.squads)) {
			// Fallback: try to use squad structure
			squads.squads.forEach(team => {
				if (team.name && Array.isArray(team.players)) {
					grouped[team.name] = team.players;
				}
			});
		} else {
			// If no team structure, show all players
			grouped['Players'] = list;
		}
		
		return grouped;
	}, [squads]);

	const filteredPlayersByTeam = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return playersByTeam;

		const filtered = {};
		Object.entries(playersByTeam).forEach(([team, players]) => {
			const filteredPlayers = players.filter((p) => 
				String(p).toLowerCase().includes(q)
			);
			if (filteredPlayers.length > 0) {
				filtered[team] = filteredPlayers;
			}
		});
		return filtered;
	}, [playersByTeam, search]);

	const countsOk = useMemo(() => {
		const u = userPlayers.length;
		const f = friendPlayers.length;
		return u >= 6 && u <= 9 && f >= 6 && f <= 9;
	}, [userPlayers, friendPlayers]);

  const isCaptainMultiplierEnabled = (ruleset) => {
    const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
    const capRule = rules.find((r) => String(r?.event || '') === 'captainMultiplier');
    return Boolean(capRule && capRule.enabled !== false);
  };

  const load = async () => {
    const [sessionRes, selectionRes] = await Promise.all([
      axiosInstance.get(`/api/matches/session/${sessionId}`),
      axiosInstance.get(`/api/player-selections/${sessionId}`).catch((err) => {
        if (err?.response?.status === 404) return { data: null };
        throw err;
      }),
    ]);

    const loadedSession = sessionRes.data || null;
    setSession(loadedSession);
    setSelection(selectionRes.data || null);

    // Load ruleset to decide whether captain selection is required/shown
    try {
      const rid = loadedSession?.rulesetId;
      if (rid) {
        const rulesetRes = await axiosInstance.get(`/api/rulesets/${rid}`);
        setCaptainEnabled(isCaptainMultiplierEnabled(rulesetRes.data));
      } else {
        setCaptainEnabled(false);
      }
    } catch {
      setCaptainEnabled(false);
    }

    // Load friend name for labels
    try {
      const fid = loadedSession?.friendId;
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

    const realMatchId = loadedSession?.realMatchId;
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
  if (captainEnabled) {
    if (!userCaptain || !userPlayers.includes(userCaptain)) {
      setError('Select your captain (must be in your team)');
      return;
    }
    if (!friendCaptain || !friendPlayers.includes(friendCaptain)) {
      setError("Select friend's captain (must be in friend's team)");
      return;
    }
  }

    setSaving(true);
    try {
      const res = await axiosInstance.post('/api/player-selections', {
        sessionId,
		userPlayers: clampPlayers(userPlayers),
		userCaptain: captainEnabled ? userCaptain : null,
		friendPlayers: clampPlayers(friendPlayers),
		friendCaptain: captainEnabled ? friendCaptain : null,
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
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Link to={`/sessions/${sessionId}/result`} className="flex-1 sm:flex-none">
              <Button variant="secondary" fullWidth>Result</Button>
            </Link>
            <Link to={`/sessions/${sessionId}/share`} className="flex-1 sm:flex-none">
              <Button variant="secondary" fullWidth>Share</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {info && <Alert type="success">{info}</Alert>}

      {loading ? (
        <div className="text-xs sm:text-sm text-slate-600">Loading...</div>
      ) : (
        <div className="grid gap-3">
          <Card title="Selected players">
            <div className="text-xs sm:text-sm text-slate-600 mb-2">
              Pick 6–9 players from {squads?.team1 && squads?.team2 ? `${squads.team1} vs ${squads.team2}` : 'the match'}. Showing playing XI players.
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700 mb-1">Search players</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  disabled={isFrozen}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300 text-sm"
                />
                <div className="mt-3 max-h-64 overflow-auto border rounded-md">
                  {Object.keys(filteredPlayersByTeam).length === 0 ? (
                    <div className="p-3 text-xs sm:text-sm text-slate-600">No players found.</div>
                  ) : (
                    <div className="divide-y">
                      {Object.entries(filteredPlayersByTeam).map(([teamName, players]) => (
                        <div key={teamName}>
                          <div className="px-3 py-2 bg-slate-100 font-semibold text-xs sm:text-sm text-slate-700 sticky top-0">
                            {teamName}
                          </div>
                          {players.map((p) => {
                            const inUser = userPlayers.includes(p);
                            const inFriend = friendPlayers.includes(p);
                            return (
                              <div key={p} className="p-2 flex items-center justify-between gap-2 hover:bg-slate-50">
                                <div className="text-xs sm:text-sm text-slate-900 truncate">{p}</div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    disabled={isFrozen || (inFriend && !inUser) || (!inUser && userPlayers.length >= 9)}
                                    onClick={() => {
                                      setUserPlayers((prev) =>
                                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                                      );
                                    }}
                                    className={`px-2 py-1 rounded-md text-xs border whitespace-nowrap ${
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
                                    className={`px-2 py-1 rounded-md text-xs border whitespace-nowrap ${
                                      inFriend
                                        ? 'bg-slate-900 text-white border-slate-900'
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
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700">My team ({userPlayers.length}/9)</div>
                <div className="text-xs text-slate-600 mb-2">Pick 6–9</div>
                <div className="text-xs sm:text-sm text-slate-900 min-h-10 break-words">
                  {userPlayers.length === 0 ? '—' : userPlayers.join(', ')}
                </div>

                <div className="mt-3 text-sm font-medium text-slate-700">{friendName} team ({friendPlayers.length}/9)</div>
                <div className="text-xs text-slate-600 mb-2">Pick 6–9</div>
                <div className="text-xs sm:text-sm text-slate-900 min-h-10 break-words">
                  {friendPlayers.length === 0 ? '—' : friendPlayers.join(', ')}
                </div>
              </div>
            </div>
          </Card>

          {captainEnabled ? (
            <Card title="Captains">
              <div className="grid gap-3 grid-cols-1">
                <label className="block">
                  <div className="text-sm font-medium text-slate-700 mb-1">My captain</div>
                  <select
                    value={userCaptain}
                    onChange={(e) => setUserCaptain(e.target.value)}
                    disabled={isFrozen}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300 text-sm"
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
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300 text-sm"
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
          ) : null}

          <div className="flex flex-col gap-2">
            <Button onClick={onSave} disabled={saving || isFrozen} fullWidth>
              {saving ? 'Saving...' : selection ? 'Update selection' : 'Create selection'}
            </Button>
            <Button variant="secondary" onClick={onFreeze} disabled={freezing || isFrozen || !selection} fullWidth>
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
