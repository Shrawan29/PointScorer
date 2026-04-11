import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
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
  if (!m) return { name: withRoleBoundary.replace(/\s+/g, ' ').trim(), role: null };
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

// ── Role badge chip ────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  'WK-Batter':         'bg-slate-100 text-[var(--brand)]',
  'Batting Allrounder':'bg-slate-100 text-[var(--brand)]',
  'Bowling Allrounder':'bg-slate-100 text-[var(--brand)]',
  'Allrounder':        'bg-slate-100 text-[var(--brand)]',
  'Batter':            'bg-slate-100 text-[var(--brand)]',
  'Bowler':            'bg-slate-100 text-[var(--brand)]',
  'Wicketkeeper':      'bg-slate-100 text-[var(--brand)]',
};

const RoleBadge = ({ role }) => {
  if (!role) return null;
  const cls = ROLE_COLORS[role] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight tracking-wide ${cls}`}>
      {role}
    </span>
  );
};

// ── Player row inside the team panel ─────────────────────────────────────────
const PlayerRow = ({ p, inUser, inFriend, isFrozen, onToggleUser, onToggleFriend, userFull, friendFull }) => {
  const { name, role } = splitPlayerNameAndRole(p);

  return (
    <div className={`group flex items-center justify-between gap-2 px-3 py-2 transition-colors duration-100
      ${inUser || inFriend ? 'bg-slate-50' : 'hover:bg-slate-50/70'}`}>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs sm:text-sm font-medium text-slate-800 truncate leading-snug">{name || p}</span>
        {role && <RoleBadge role={role} />}
      </div>
      <div className="flex gap-1.5 shrink-0">
        {/* Me button */}
        <button
          type="button"
          disabled={isFrozen || (!inUser && userFull)}
          onClick={onToggleUser}
          title={inUser ? 'Remove from your team' : 'Add to your team'}
          className={`relative min-h-[30px] min-w-[46px] rounded-lg text-[11px] font-bold border transition-all duration-150
            ${inUser
              ? 'bg-[var(--brand)] text-white border-[var(--brand)] shadow-sm shadow-slate-300/40'
              : 'bg-white text-slate-500 border-slate-200 hover:border-[var(--brand)] hover:text-[var(--brand)]'}
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="flex items-center justify-center gap-0.5">
            {inUser && (
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Me
          </span>
        </button>

        {/* Friend button */}
        <button
          type="button"
          disabled={isFrozen || (!inFriend && friendFull)}
          onClick={onToggleFriend}
          title={inFriend ? 'Remove from friend\'s team' : 'Add to friend\'s team'}
          className={`relative min-h-[30px] min-w-[46px] rounded-lg text-[11px] font-bold border transition-all duration-150
            ${inFriend
              ? 'bg-[var(--brand)] text-white border-[var(--brand)] shadow-sm shadow-slate-300/40'
              : 'bg-white text-slate-500 border-slate-200 hover:border-[var(--brand)] hover:text-[var(--brand)]'}
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="flex items-center justify-center gap-0.5">
            {inFriend && (
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {/* friendName truncated to 'Friend' in button for space reasons */}
            Friend
          </span>
        </button>
      </div>
    </div>
  );
};

// ── Selected team summary pill list ──────────────────────────────────────────
const TeamSummary = ({ label, players, count, accentClass }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        count >= 6 && count <= 9
          ? 'bg-slate-100 text-[var(--brand)]'
          : count > 0
          ? 'bg-slate-100 text-slate-600'
          : 'bg-slate-100 text-slate-500'
      }`}>
        {count}/9
      </span>
    </div>
    {players.length === 0 ? (
      <p className="text-[11px] text-slate-400 italic">No players selected yet</p>
    ) : (
      <div className="flex flex-wrap gap-1">
        {players.map((p) => {
          const { name, role } = splitPlayerNameAndRole(p);
          return (
            <span
              key={p}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium
                ${accentClass}`}
            >
              {name || p}
              {role && <span className="opacity-60">·{role.split(' ')[0]}</span>}
            </span>
          );
        })}
      </div>
    )}
  </div>
);

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

  const team1SquadPlayers    = useMemo(() => uniquePlayers(squads?.team1?.squad      || []), [squads?.team1?.squad]);
  const team2SquadPlayers    = useMemo(() => uniquePlayers(squads?.team2?.squad      || []), [squads?.team2?.squad]);
  const team1PlayingXIPlayers = useMemo(() => uniquePlayers(squads?.team1?.playingXI || []), [squads?.team1?.playingXI]);
  const team2PlayingXIPlayers = useMemo(() => uniquePlayers(squads?.team2?.playingXI || []), [squads?.team2?.playingXI]);

  const hasTeamSquads    = team1SquadPlayers.length > 0    || team2SquadPlayers.length > 0;
  const hasTeamPlayingXI = team1PlayingXIPlayers.length > 0 || team2PlayingXIPlayers.length > 0;
  const showPlayingXI    = Boolean(squads?.isPlayingXIDeclared && hasTeamPlayingXI);

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
    const fallback = uniquePlayers(squads?.playingXI?.length ? squads.playingXI : squads?.players || []);
    if ((team1Name || team2Name) && fallback.length >= 2) {
      const splitIndex = Math.ceil(fallback.length / 2);
      grouped[team1Name || 'Team 1'] = fallback.slice(0, splitIndex);
      grouped[team2Name || 'Team 2'] = fallback.slice(splitIndex);
      return grouped;
    }
    grouped['Players'] = fallback;
    return grouped;
  }, [squads, hasTeamPlayingXI, hasTeamSquads, showPlayingXI, team1Name, team2Name,
      team1PlayingXIPlayers, team2PlayingXIPlayers, team1SquadPlayers, team2SquadPlayers]);

  const filteredPlayersByTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return playersByTeam;
    const filtered = {};
    Object.entries(playersByTeam).forEach(([team, players]) => {
      const fp = players.filter((p) =>
        String(p).toLowerCase().includes(q) || formatPlayerLabel(p).toLowerCase().includes(q)
      );
      if (fp.length > 0) filtered[team] = fp;
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

    const rid = loadedSession?.rulesetId;
    const fid = loadedSession?.friendId;
    const realMatchId = loadedSession?.realMatchId;

    const [rulesetRes, friendsRes, squadsRes] = await Promise.all([
      rid ? axiosInstance.get(`/api/rulesets/${rid}`).catch(() => null) : Promise.resolve(null),
      fid ? axiosInstance.get('/api/friends').catch(() => null) : Promise.resolve(null),
      realMatchId
        ? axiosInstance
            .get(`/api/cricket/matches/${realMatchId}/squads`, {
              params: { team1Name: loadedSession?.team1 || undefined, team2Name: loadedSession?.team2 || undefined },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    setCaptainEnabled(isCaptainMultiplierEnabled(rulesetRes?.data));
    if (friendsRes?.data && fid) {
      const list = friendsRes.data || [];
      const fr = list.find((f) => String(f?._id) === String(fid));
      setFriendName(fr?.friendName || 'Friend');
    } else {
      setFriendName('Friend');
    }
    setSquads(squadsRes?.data || null);

    const s = selectionRes.data;
    const up = Array.isArray(s?.userPlayers) && s.userPlayers.length > 0 ? s.userPlayers : s?.selectedPlayers || [];
    const fp = s?.friendPlayers || [];
    setUserPlayers(uniquePlayers(up));
    setFriendPlayers(uniquePlayers(fp));
    setUserCaptain(s?.userCaptain || s?.captain || '');
    setFriendCaptain(s?.friendCaptain || '');
  };

  useEffect(() => {
    setError(''); setInfo(''); setLoading(true);
    load()
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load selection'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const onSave = async () => {
    setError(''); setInfo('');
    if (!countsOk) { setError('Pick 6 to 9 players for both you and your friend'); return; }
    if (captainEnabled) {
      if (!userCaptain || !userPlayers.includes(userCaptain)) { setError('Select your captain (must be in your team)'); return; }
      if (!friendCaptain || !friendPlayers.includes(friendCaptain)) { setError("Select friend's captain (must be in friend's team)"); return; }
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
    } finally { setSaving(false); }
  };

  const onFreeze = async () => {
    setError(''); setInfo(''); setFreezing(true);
    try {
      const res = await axiosInstance.post(`/api/player-selections/freeze/${sessionId}`);
      setSelection(res.data);
      setInfo('Selection frozen. It can no longer be edited.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to freeze selection');
    } finally { setFreezing(false); }
  };

  // ── total selected count badge ────────────────────────────────────────────
  const totalSelected = userPlayers.length + friendPlayers.length;

  return (
    <Layout>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Player Selection</h1>
          <p className="mt-0.5 text-xs text-slate-400">Once frozen, selection is immutable.</p>
        </div>
        {isFrozen && (
          <div className="flex flex-row gap-2">
            <Link to={`/sessions/${sessionId}/result`}>
              <Button variant="secondary">Result</Button>
            </Link>
          </div>
        )}
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {info  && <Alert type="success" floating>{info}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4 text-[var(--brand)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading…
        </div>
      ) : (
        <div className="grid gap-5 pb-24 sm:pb-0">

          {/* ── Squad picker card ──────────────────────────────────────────── */}
          <Card title="Select players">

            {/* Playing XI not-yet-declared banner */}
            {squads?.isPlayingXIDeclared === false && (
              <div className="mb-4 flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <svg className="mt-0.5 w-4 h-4 shrink-0 text-[var(--brand)]" fill="none" viewBox="0 0 24 24">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Playing XI not declared yet</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Toss hasn't happened. Showing squads for now — we'll switch to the final XI once announced.
                  </p>
                </div>
              </div>
            )}

            {/* Context line */}
            <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
              Pick <span className="font-semibold text-slate-700">6–9 players</span> each from{' '}
              {team1Name && team2Name
                ? <><span className="font-semibold text-[var(--brand)]">{team1Name}</span> vs <span className="font-semibold text-[var(--brand)]">{team2Name}</span></>
                : 'the match'}.{' '}
              <span className="text-slate-400">{showPlayingXI ? 'Playing XI.' : 'Showing squads.'}</span>
            </p>

            {/* Search */}
            <div className="relative mb-3">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                fill="none" viewBox="0 0 24 24">
                <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players…"
                disabled={isFrozen}
                className="w-full min-h-10 rounded-xl border border-slate-200 bg-white pl-8 pr-3.5 py-2 text-sm
                  placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30
                  focus:border-[var(--brand)] disabled:bg-slate-100 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Team panels */}
            {Object.keys(filteredPlayersByTeam).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                No players match "<span className="italic">{search}</span>"
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(filteredPlayersByTeam).map(([teamName, players], teamIndex) => {
                  return (
                    <div key={teamName} className="rounded-xl border border-slate-200 overflow-hidden">
                      {/* Team header */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 bg-[var(--brand)]">
                          {teamIndex + 1}
                        </span>
                        <span className="text-xs font-bold tracking-wide text-slate-700">
                          {teamName}
                        </span>
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-[var(--brand)]">
                          {players.length}p
                        </span>
                      </div>

                      {/* Player rows */}
                      <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto bg-white">
                        {players.map((p) => (
                          <PlayerRow
                            key={p}
                            p={p}
                            inUser={userPlayers.includes(p)}
                            inFriend={friendPlayers.includes(p)}
                            isFrozen={isFrozen}
                            userFull={userPlayers.length >= 9}
                            friendFull={friendPlayers.length >= 9}
                            onToggleUser={() =>
                              setUserPlayers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
                            }
                            onToggleFriend={() =>
                              setFriendPlayers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected team summaries */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TeamSummary
                label={`${userDisplayName}'s team`}
                players={userPlayers}
                count={userPlayers.length}
                accentClass="border-slate-200 bg-slate-50 text-[var(--brand)]"
              />
              <TeamSummary
                label={`${friendName}'s team`}
                players={friendPlayers}
                count={friendPlayers.length}
                accentClass="border-slate-200 bg-slate-50 text-[var(--brand)]"
              />
            </div>

            {/* Progress hint */}
            {!isFrozen && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <span className={`w-2 h-2 rounded-full ${countsOk ? 'bg-[var(--brand)]' : 'bg-slate-300'}`} />
                {countsOk
                  ? 'Both teams are ready to save'
                  : `Select 6–9 for each team (you: ${userPlayers.length}, ${friendName}: ${friendPlayers.length})`}
              </div>
            )}
          </Card>

          {/* ── Captains card ──────────────────────────────────────────────── */}
          {captainEnabled && (
            <Card title="Captains">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* User captain */}
                <label className="block">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[var(--brand)] flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {userDisplayName}'s captain
                    </span>
                  </div>
                  <select
                    value={userCaptain}
                    onChange={(e) => setUserCaptain(e.target.value)}
                    disabled={isFrozen}
                    className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm
                      focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]
                      disabled:bg-slate-100 transition"
                  >
                    <option value="">Select captain…</option>
                    {userPlayers.map((p) => (
                      <option key={p} value={p}>{formatPlayerLabel(p)}</option>
                    ))}
                  </select>
                </label>

                {/* Friend captain */}
                <label className="block">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[var(--brand)] flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {friendName}'s captain
                    </span>
                  </div>
                  <select
                    value={friendCaptain}
                    onChange={(e) => setFriendCaptain(e.target.value)}
                    disabled={isFrozen}
                    className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm
                      focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]
                      disabled:bg-slate-100 transition"
                  >
                    <option value="">Select captain…</option>
                    {friendPlayers.map((p) => (
                      <option key={p} value={p}>{formatPlayerLabel(p)}</option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <Button onClick={onSave} disabled={saving || isFrozen} fullWidth>
              {saving ? 'Saving…' : selection ? 'Update selection' : 'Create selection'}
            </Button>
            <Button variant="secondary" onClick={onFreeze} disabled={freezing || isFrozen || !selection} fullWidth>
              {freezing ? 'Freezing…' : isFrozen ? 'Frozen ✓' : 'Freeze selection'}
            </Button>
          </div>

          {/* ── Frozen notice ─────────────────────────────────────────────── */}
          {isFrozen && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Selection is frozen — view only.
            </div>
          )}
        </div>
      )}

      {/* ── Mobile sticky footer ──────────────────────────────────────────── */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95
        px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)] backdrop-blur">
        <div className="mx-auto w-full max-w-5xl grid grid-cols-2 gap-2">
          <Button onClick={onSave} disabled={saving || isFrozen} fullWidth>
            {saving ? 'Saving…' : selection ? 'Update' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={onFreeze} disabled={freezing || isFrozen || !selection} fullWidth>
            {freezing ? 'Freezing…' : 'Freeze'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default PlayerSelectionPage;