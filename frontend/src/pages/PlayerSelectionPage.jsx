import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STAFF_ROLE_RE = /\b(coaches?|assistant\s+coaches?|head\s+coaches?|batting\s+coaches?|bowling\s+coaches?|fielding\s+coaches?|mentor|manager|team\s+manager|physio|physiotherapist|trainer|analyst|support\s+staff|staff|team\s+doctor|masseur|selector|consultant|director|scout)\b/i;
const PLAYER_ROLE_SUFFIX_RE = /(WK-?Batter|Batting Allrounder|Bowling Allrounder|Allrounder|Batter|Bowler|Wicket-?Keeper|Keeper)$/i;
const PLAYER_WITH_ROLE_RE = /^(.*?)(?:\s+)?(WK-?Batter|Batting Allrounder|Bowling Allrounder|Allrounder|Batter|Bowler|Wicket-?Keeper|Keeper)$/i;

const normalizeRoleLabel = (value) => {
  const key = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'wkbatter' || key === 'wicketkeeperbatter' || key === 'wicketkeeper') return 'WK-Batter';
  if (key === 'battingallrounder') return 'Batting Allrounder';
  if (key === 'bowlingallrounder') return 'Bowling Allrounder';
  if (key === 'allrounder') return 'Allrounder';
  if (key === 'batter') return 'Batter';
  if (key === 'bowler') return 'Bowler';
  if (key === 'keeper') return 'Wicketkeeper';
  return String(value || '').replace(/\s+/g, ' ').trim();
};

const splitPlayerNameAndRole = (value) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { name: '', role: null };

  const withRoleBoundary = raw.replace(
    /([a-z])(?=(WK-?Batter|Batting Allrounder|Bowling Allrounder|Allrounder|Batter|Bowler|Wicket-?Keeper|Keeper)$)/i,
    '$1 '
  );

  const m = withRoleBoundary.match(PLAYER_WITH_ROLE_RE);
  if (!m) {
    return {
      name: withRoleBoundary.replace(/\s+/g, ' ').trim(),
      role: null,
    };
  }

  const name = String(m[1] || '').replace(/[,:;\-]+$/g, '').replace(/\s+/g, ' ').trim();
  const role = normalizeRoleLabel(m[2]);
  return { name, role: role || null };
};

const formatPlayerLabel = (value) => {
  const { name, role } = splitPlayerNameAndRole(value);
  if (!name) return '';
  return role ? `${name} (${role})` : name;
};

const normalizePlayerKey = (value) =>
  String(value || '')
    .replace(/[\u2020†*]/g, '')
    .replace(/\[(?:[^\]]*)\]/g, '')
    .replace(/\((?:[^)]*)\)/g, '')
    .replace(PLAYER_ROLE_SUFFIX_RE, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const sanitizePlayerName = (value) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const cleaned = raw
    .replace(/^[\d\s.)\-•*]+/, '')
    .replace(/[\u2020†*]/g, '')
    .replace(/\[(?:c|vc|wk|wk\/c|c\/wk|captain|vice\s*captain|sub|substitute|reserve|impact\s*player)\]/gi, '')
    .replace(/\((?:c|vc|wk|wk\/c|c\/wk|captain|vice\s*captain|sub|substitute|reserve|impact\s*player)\)/gi, '')
    .replace(/\((?:[^)]*\b(?:coaches?|physio|physiotherapist|trainer|analyst|manager|mentor|support\s*staff|team\s*doctor|masseur|selector|consultant|director|scout)\b[^)]*)\)/gi, '')
    .replace(/\s*[-:]\s*(?:captain|vice\s*captain|wicket\s*-?\s*keeper)\b.*$/i, '')
    .replace(/,\s*(?:captain|vice\s*captain|wicket\s*-?\s*keeper)\b.*$/i, '')
    .replace(/[,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (STAFF_ROLE_RE.test(cleaned)) return '';
  if (!/[A-Za-z]/.test(cleaned)) return '';
  if (cleaned.length < 2 || cleaned.length > 45) return '';

  return cleaned;
};

const uniquePlayers = (arr) => {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = sanitizePlayerName(v);
    if (!s) continue;
    const key = normalizePlayerKey(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
};

const clampPlayers = (arr) => uniquePlayers(arr).slice(0, 9);

export const PlayerSelectionPage = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();

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
  const userDisplayName = useMemo(() => user?.name || user?.email || 'User', [user]);

  const team1Name = squads?.team1?.name || null;
  const team2Name = squads?.team2?.name || null;

  const team1SquadPlayers = useMemo(() => uniquePlayers(squads?.team1?.squad || []), [squads?.team1?.squad]);
  const team2SquadPlayers = useMemo(() => uniquePlayers(squads?.team2?.squad || []), [squads?.team2?.squad]);
  const team1PlayingXIPlayers = useMemo(() => uniquePlayers(squads?.team1?.playingXI || []), [squads?.team1?.playingXI]);
  const team2PlayingXIPlayers = useMemo(() => uniquePlayers(squads?.team2?.playingXI || []), [squads?.team2?.playingXI]);

  const hasTeamSquads = team1SquadPlayers.length > 0 || team2SquadPlayers.length > 0;
  const hasTeamPlayingXI = team1PlayingXIPlayers.length > 0 || team2PlayingXIPlayers.length > 0;

  const showPlayingXI = Boolean(squads?.isPlayingXIDeclared && hasTeamPlayingXI);

  const availablePlayers = useMemo(() => {
    const list = uniquePlayers(showPlayingXI
      ? [...team1PlayingXIPlayers, ...team2PlayingXIPlayers]
      : [...team1SquadPlayers, ...team2SquadPlayers]);
		const q = search.trim().toLowerCase();
		if (!q) return list;
		return list.filter((p) => String(p).toLowerCase().includes(q));
  }, [team1PlayingXIPlayers, team2PlayingXIPlayers, team1SquadPlayers, team2SquadPlayers, search, showPlayingXI]);

	// Group players by team
	const playersByTeam = useMemo(() => {
		const grouped = {};

    if (showPlayingXI && hasTeamPlayingXI) {
      if (team1PlayingXIPlayers.length > 0) grouped[team1Name || 'Team 1'] = team1PlayingXIPlayers;
      if (team2PlayingXIPlayers.length > 0) grouped[team2Name || 'Team 2'] = team2PlayingXIPlayers;
      if (Object.keys(grouped).length > 0) return grouped;
    }

    if (hasTeamSquads) {
      if (team1SquadPlayers.length > 0) grouped[team1Name || 'Team 1'] = team1SquadPlayers;
      if (team2SquadPlayers.length > 0) grouped[team2Name || 'Team 2'] = team2SquadPlayers;
      if (Object.keys(grouped).length > 0) return grouped;
    }

    // Last resort: if we only have one flat list, keep a team-wise UI split.
    const fallback = uniquePlayers(squads?.playingXI?.length ? squads.playingXI : squads?.players || []);
		if ((team1Name || team2Name) && fallback.length >= 2) {
			const splitIndex = Math.ceil(fallback.length / 2);
			grouped[team1Name || 'Team 1'] = fallback.slice(0, splitIndex);
			grouped[team2Name || 'Team 2'] = fallback.slice(splitIndex);
			return grouped;
		}

		grouped['Players'] = fallback;
		
		return grouped;
  }, [
    squads,
    hasTeamPlayingXI,
    hasTeamSquads,
    showPlayingXI,
    team1Name,
    team2Name,
    team1PlayingXIPlayers,
    team2PlayingXIPlayers,
    team1SquadPlayers,
    team2SquadPlayers,
  ]);

	const filteredPlayersByTeam = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return playersByTeam;

		const filtered = {};
		Object.entries(playersByTeam).forEach(([team, players]) => {
			const filteredPlayers = players.filter((p) => 
        String(p).toLowerCase().includes(q) || formatPlayerLabel(p).toLowerCase().includes(q)
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
  setUserPlayers(uniquePlayers(up));
  setFriendPlayers(uniquePlayers(fp));
  setUserCaptain(s?.userCaptain || s?.captain || '');
  setFriendCaptain(s?.friendCaptain || '');

    const realMatchId = loadedSession?.realMatchId;
    if (realMatchId) {
      try {
        const squadsRes = await axiosInstance.get(`/api/cricket/matches/${realMatchId}/squads`, {
          params: {
            team1Name: loadedSession?.team1 || undefined,
            team2Name: loadedSession?.team2 || undefined,
          },
        });
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
        <div className="grid gap-4 pb-24 sm:pb-0">
          <Card title="Selected players">
              {squads?.isPlayingXIDeclared === false ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-amber-900 font-semibold text-sm">Playing XI not declared yet</div>
                  <p className="text-xs sm:text-sm text-amber-800 mt-1">
                    Toss hasn’t happened yet. Showing squads for now. Once Playing XI is announced, we’ll show the final XI.
                  </p>
                </div>
              ) : null}

              <div className="text-xs sm:text-sm text-slate-600 mb-3">
                Pick 6–9 players for you and your friend from{' '}
                {team1Name && team2Name ? `${team1Name} and ${team2Name}` : 'the match'}.{' '}
                {showPlayingXI ? 'Showing Playing XI.' : 'Showing squads.'} Players are grouped by team below.
              </div>

                <div className="flex flex-col gap-3">
                  <div className="flex-1">
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Search players</div>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search"
                      disabled={isFrozen}
                      className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-100"
                    />
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                      {Object.keys(filteredPlayersByTeam).length === 0 ? (
                    <div className="p-3 text-xs sm:text-sm text-slate-600">No players found.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.entries(filteredPlayersByTeam).map(([teamName, players], teamIndex) => (
                        <div key={teamName} className="min-w-0 rounded-xl border border-slate-200 bg-white">
                          <div className={`px-3 py-2.5 font-semibold text-xs sm:text-sm border-b-2 ${
                            teamIndex === 0 
                              ? 'bg-blue-50 text-blue-900 border-blue-200' 
                              : 'bg-orange-50 text-orange-900 border-orange-200'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                teamIndex === 0 ? 'bg-blue-600' : 'bg-orange-600'
                              }`}>
                                {teamIndex + 1}
                              </span>
                              {teamName}
                            </div>
                          </div>
                          <div className="divide-y max-h-64 overflow-auto">
                          {players.map((p) => {
                            const inUser = userPlayers.includes(p);
                            const inFriend = friendPlayers.includes(p);
                            const displayLabel = formatPlayerLabel(p);
                            return (
                                <div key={p} className="flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-slate-50">
                                <div className="text-xs sm:text-sm text-slate-900 truncate">{displayLabel}</div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    disabled={isFrozen || (inFriend && !inUser) || (!inUser && userPlayers.length >= 9)}
                                    onClick={() => {
                                      setUserPlayers((prev) =>
                                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                                      );
                                    }}
                                      className={`min-h-8 px-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                                      inUser
                                          ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
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
                                      className={`min-h-8 px-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                                      inFriend
                                          ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
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
                        </div>
                      ))}
                    </div>
                      )}
                    </div>
                  </div>

              <div className="flex-1 grid grid-cols-1 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-sm font-semibold text-slate-900 mb-2">{userDisplayName}'s team ({userPlayers.length}/9)</div>
                  <div className="text-xs text-slate-600 mb-2">Pick 6–9 players</div>
                  <div className="min-h-12 rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-900 break-words">
                    {userPlayers.length === 0 ? (
                      <span className="text-slate-400">No players selected yet</span>
                    ) : (
                      userPlayers.map((p) => formatPlayerLabel(p)).join(', ')
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-sm font-semibold text-slate-900 mb-2">{friendName}'s team ({friendPlayers.length}/9)</div>
                  <div className="text-xs text-slate-600 mb-2">Pick 6–9 players</div>
                  <div className="min-h-12 rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-900 break-words">
                    {friendPlayers.length === 0 ? (
                      <span className="text-slate-400">No players selected yet</span>
                    ) : (
                      friendPlayers.map((p) => formatPlayerLabel(p)).join(', ')
                    )}
                  </div>
                </div>
              </div>
            </div>

          </Card>

          {captainEnabled ? (
            <Card title="Captains">
              <div className="grid gap-3 grid-cols-1">
                <label className="block">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{userDisplayName} captain</div>
                  <select
                    value={userCaptain}
                    onChange={(e) => setUserCaptain(e.target.value)}
                    disabled={isFrozen}
                    className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-100"
                  >
                    <option value="">Select captain</option>
                    {userPlayers.map((p) => (
                      <option key={p} value={p}>
                        {formatPlayerLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{friendName} captain</div>
                  <select
                    value={friendCaptain}
                    onChange={(e) => setFriendCaptain(e.target.value)}
                    disabled={isFrozen}
                    className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-100"
                  >
                    <option value="">Select captain</option>
                    {friendPlayers.map((p) => (
                      <option key={p} value={p}>
                        {formatPlayerLabel(p)}
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

          <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)] backdrop-blur">
            <div className="mx-auto w-full max-w-5xl grid grid-cols-2 gap-2">
              <Button onClick={onSave} disabled={saving || isFrozen} fullWidth>
                {saving ? 'Saving...' : selection ? 'Update selection' : 'Create selection'}
              </Button>
              <Button variant="secondary" onClick={onFreeze} disabled={freezing || isFrozen || !selection} fullWidth>
                {freezing ? 'Freezing...' : 'Freeze'}
              </Button>
            </div>
          </div>

          {isFrozen && <Alert>Selection is frozen. UI is read-only.</Alert>}
        </div>
      )}
    </Layout>
  );
};

export default PlayerSelectionPage;
