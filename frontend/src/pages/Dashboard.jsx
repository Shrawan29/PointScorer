import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Card from '../components/Card.jsx';
import MatchList from '../components/MatchList.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const TAB_TODAY = 'TODAY';
const TAB_UPCOMING = 'UPCOMING';
const TYPE_ALL = 'ALL';
const TYPE_T20 = 'T20';
const TYPE_ODI = 'ODI';
const TYPE_TEST = 'TEST';
const TYPE_IPL = 'IPL';
const CACHE_TTL_MS = 7200000;
const DASHBOARD_UPDATE_VERSION = '2026-04-live-room-updates-v4';

const readCachedMatches = (cacheKey) => {
  const sources = [sessionStorage, localStorage];
  for (const store of sources) {
    try {
      const cachedRaw = store.getItem(cacheKey);
      if (!cachedRaw) continue;
      const cached = JSON.parse(cachedRaw);
      const age = Date.now() - Number(cached?.ts || 0);
      if (age >= 0 && age < CACHE_TTL_MS && cached?.data) {
        return cached;
      }
    } catch {
      // ignore malformed cache entries
    }
  }
  return null;
};

const writeCachedMatches = (cacheKey, data) => {
  const serialized = JSON.stringify({ ts: Date.now(), data });
  try { sessionStorage.setItem(cacheKey, serialized); } catch { /* ignore */ }
  try { localStorage.setItem(cacheKey, serialized); } catch { /* ignore */ }
};

const clearCachedMatches = (cacheKey) => {
  try { sessionStorage.removeItem(cacheKey); } catch { /* ignore */ }
  try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
};

const normalizeType = (value) => {
  if (!value) return null;
  const v = String(value).toUpperCase();
  if (v.includes('T20') || v.includes('T20I')) return TYPE_T20;
  if (v.includes('T10')) return TYPE_T20;
  if (v.includes('100 BALL') || v.includes('THE HUNDRED')) return TYPE_T20;
  if (v.includes('ODI') || v.includes('ONE DAY')) return TYPE_ODI;
  if (v.includes('TEST')) return TYPE_TEST;
  return null;
};

const inferTypeFromName = (name) => {
  if (!name) return null;
  const n = String(name).toUpperCase();
  if (n.includes('T20') || n.includes('T20I')) return TYPE_T20;
  if (n.includes('T10')) return TYPE_T20;
  if (n.includes('100 BALL') || n.includes('THE HUNDRED')) return TYPE_T20;
  if (n.includes('ODI') || n.includes('ONE DAY')) return TYPE_ODI;
  if (n.includes('TEST')) return TYPE_TEST;
  return null;
};

const teamsTextForSearch = (teams) => {
  if (!teams) return '';
  if (typeof teams === 'string') return teams;
  if (Array.isArray(teams)) {
    return teams
      .map((t) => (typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName))
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const IPL_TEAM_TOKENS = new Set([
  'kkr', 'kolkata knight riders',
  'srh', 'sunrisers hyderabad',
  'mi', 'mumbai indians',
  'csk', 'chennai super kings',
  'rcb', 'royal challengers bengaluru', 'royal challengers bangalore',
  'dc', 'delhi capitals',
  'rr', 'rajasthan royals',
  'pbks', 'punjab kings',
  'kxip', 'kings xi punjab',
  'lsg', 'lucknow super giants',
  'gt', 'gujarat titans',
]);

const normalizeTeamToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyIplTeam = (value) => {
  const token = normalizeTeamToken(value);
  if (!token) return false;
  return IPL_TEAM_TOKENS.has(token);
};

const isLikelyIplTeamsPair = (match) => {
  const list = Array.isArray(match?.teams)
    ? match.teams.map((t) => (typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName)).filter(Boolean)
    : [];
  if (list.length < 2) return false;
  return isLikelyIplTeam(list[0]) && isLikelyIplTeam(list[1]);
};

const isIplMatch = (match) => {
  const text = `${match?.league || ''} ${match?.seriesName || ''} ${match?.matchName || ''} ${match?.rawText || ''}`.toLowerCase();
  if (/indian premier league|\bipl\b/.test(text) && !/women|women's|womens|\bwpl\b/.test(text)) return true;
  return isLikelyIplTeamsPair(match);
};

const extractMatchId = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return String(value);
  const s = String(value);
  const m = s.match(/\/live-cricket-scores\/(\d+)\//i) || s.match(/\/cricket-scores\/(\d+)\//i);
  return m?.[1] || null;
};

const normalizeMatch = (match, forcedStatus) => {
  const matchStatus = match?.matchStatus || forcedStatus || null;
  const matchUrl = match?.matchUrl ?? match?.url ?? null;
  const teams = match?.teams ?? (match?.team1 || match?.team2 ? [match?.team1, match?.team2].filter(Boolean) : null);
  const derivedMatchId = match?.matchId ?? match?.id ?? extractMatchId(matchUrl);
  const matchName = match?.matchName ?? match?.matchDesc ?? match?.matchDescription ?? match?.name ?? null;
  const normalizedType =
    normalizeType(match?.matchType) ||
    normalizeType(match?.matchFormat) ||
    normalizeType(match?.format) ||
    normalizeType(matchName) ||
    inferTypeFromName(matchName);
  return {
    matchId: derivedMatchId ?? null,
    matchName,
    teams,
    matchType: normalizedType,
    league: match?.league ?? null,
    seriesName: match?.seriesName ?? null,
    matchStatus,
    startTime: match?.startTime ?? match?.startTimeText ?? null,
    matchUrl,
    rawText: match?.rawText ?? null,
  };
};

export const DashboardMatches = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const requestSeqRef = useRef(0);
  const iplSeasonHydratedRef = useRef(false);
  const dataRef = useRef({ todayMatches: [], upcomingMatches: [] });

  const [activeTab, setActiveTab] = useState(TAB_TODAY);
  const [matchType, setMatchType] = useState(TYPE_ALL);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState({ todayMatches: [], upcomingMatches: [] });
  const forceShowUpdateNotice = useMemo(() => {
    const qp = new URLSearchParams(location.search || '');
    return qp.get('showUpdate') === '1';
  }, [location.search]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const userId = String(user?.id || user?._id || '').trim();
    if (!userId) {
      setShowUpdateNotice(forceShowUpdateNotice);
      return;
    }

    let cancelled = false;

    const loadUpdateNoticeStatus = async () => {
      try {
        const res = await axiosInstance.get(
          `/api/auth/update-notice/${encodeURIComponent(DASHBOARD_UPDATE_VERSION)}`
        );
        if (cancelled) return;

        const seen = Boolean(res?.data?.seen);
        setShowUpdateNotice(forceShowUpdateNotice || !seen);
      } catch {
        if (cancelled) return;
        // Fail-open so users still get the notice if status check fails.
        setShowUpdateNotice(true);
      }
    };

    void loadUpdateNoticeStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?._id, forceShowUpdateNotice]);

  const fetchMatchesFromApi = async ({
    bypassBackendCache = false,
    includeIplSeason = false,
    requestedType = TYPE_ALL,
    onPartialData = null,
  } = {}) => {
    const normalizedType = String(requestedType || TYPE_ALL).toUpperCase();
    const commonParams = [];
    if (normalizedType !== TYPE_ALL) commonParams.push(`matchType=${encodeURIComponent(normalizedType)}`);

    const todayParams = [...commonParams];
    if (bypassBackendCache) todayParams.push('nocache=1');
    if (includeIplSeason) todayParams.push('includeIplSeason=1');
    const todayUrl = `/api/cricket/matches${todayParams.length ? `?${todayParams.join('&')}` : ''}`;

    const upcomingParams = [...commonParams];
    if (bypassBackendCache) upcomingParams.push('nocache=1');
    const upcomingUrl = `/api/cricket/matches/upcoming${upcomingParams.length ? `?${upcomingParams.join('&')}` : ''}`;

    const errors = [];

    const todayArray = await axiosInstance
      .get(todayUrl)
      .then((res) => (Array.isArray(res?.data) ? res.data : []))
      .catch((e) => {
        errors.push(e?.response?.data?.message || 'Failed to load today/live matches');
        return [];
      });

    const todayMatches = todayArray.map((m) => normalizeMatch(m, TAB_TODAY));
    if (typeof onPartialData === 'function') {
      onPartialData({ todayMatches });
    }

    const upcomingArray = await Promise.race([
      axiosInstance.get(upcomingUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)),
    ])
      .then((res) => (Array.isArray(res?.data) ? res.data : []))
      .catch((e) => {
        errors.push(e?.response?.data?.message || 'Failed to load upcoming matches');
        return [];
      });
    const upcomingMatches = upcomingArray.map((m) => normalizeMatch(m, TAB_UPCOMING));
    return { nextData: { todayMatches, upcomingMatches }, errors };
  };

  const loadMatches = async (useCache = true, options = {}) => {
    const includeIplSeason = Boolean(options?.includeIplSeason);
    const requestedType = String(options?.requestedType || TYPE_ALL).toUpperCase();
    const cacheKey = `cricketMatchesCacheV4_${includeIplSeason ? 'ipl' : 'base'}_${requestedType}`;
    const reqId = (requestSeqRef.current += 1);

    if (!useCache) {
      setLoading(true);
      setError('');
    }
    try {
      if (useCache) {
        const cached = readCachedMatches(cacheKey);
        if (cached?.data) {
          const today = Array.isArray(cached?.data?.todayMatches) ? cached.data.todayMatches : [];
          const upcoming = Array.isArray(cached?.data?.upcomingMatches) ? cached.data.upcomingMatches : [];
          const all = [...today, ...upcoming];
          const hasMissingType = all.length > 0 && all.some((m) => !m?.matchType);
          if (requestSeqRef.current === reqId) setData(cached.data);
          if (hasMissingType && requestedType === TYPE_ALL) {
            void (async () => {
              try {
                const res = await fetchMatchesFromApi({
                  bypassBackendCache: false,
                  includeIplSeason,
                  requestedType,
                  onPartialData: (partialData) => {
                    if (requestSeqRef.current !== reqId) return;
                    setData((prev) => ({ ...prev, ...partialData }));
                  },
                });
                if (requestSeqRef.current !== reqId) return;
                setData(res.nextData);
                writeCachedMatches(cacheKey, res.nextData);
              } catch { /* ignore */ }
            })();
          }
          return;
        }
      } else {
        clearCachedMatches(cacheKey);
      }

      const { nextData, errors } = await fetchMatchesFromApi({
        bypassBackendCache: !useCache,
        includeIplSeason,
        requestedType,
        onPartialData: (partialData) => {
          if (requestSeqRef.current !== reqId) return;
          setData((prev) => ({ ...prev, ...partialData }));
        },
      });
      if (requestSeqRef.current !== reqId) return;
      setData(nextData);
      writeCachedMatches(cacheKey, nextData);
      if (errors.length > 0 && nextData.todayMatches.length === 0 && nextData.upcomingMatches.length === 0) {
        setError(errors[0]);
      }
    } catch (err) {
      if (requestSeqRef.current === reqId) setError(err?.response?.data?.message || 'Failed to load matches');
    } finally {
      if (!useCache && requestSeqRef.current === reqId) setLoading(false);
    }
  };

  useEffect(() => {
    void loadMatches(true, { includeIplSeason: false, requestedType: TYPE_ALL });
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const current = dataRef.current;
      const all = [...(current?.todayMatches || []), ...(current?.upcomingMatches || [])];
      const hasMissingType = all.length > 0 && all.some((m) => !m?.matchType);
      if (hasMissingType) {
        void loadMatches(true, { includeIplSeason: false, requestedType: TYPE_ALL });
      }
    }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setSearchInput(search); }, [search]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); }, 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  const todayMatches = data.todayMatches || [];
  const upcomingMatches = data.upcomingMatches || [];

  const filteredTodayMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todayMatches.filter((m) => {
      const typeOk =
        matchType === TYPE_ALL ||
        (matchType === TYPE_IPL ? isIplMatch(m) : String(m?.matchType || '').toUpperCase() === matchType);
      if (!typeOk) return false;
      if (!q) return true;
      const haystack = `${m?.matchName || ''} ${teamsTextForSearch(m?.teams)} ${m?.rawText || ''} ${m?.matchType || ''} ${m?.matchStatus || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [todayMatches, matchType, search]);

  const filteredUpcomingMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return upcomingMatches.filter((m) => {
      const typeOk =
        matchType === TYPE_ALL ||
        (matchType === TYPE_IPL ? isIplMatch(m) : String(m?.matchType || '').toUpperCase() === matchType);
      if (!typeOk) return false;
      if (!q) return true;
      const haystack = `${m?.matchName || ''} ${teamsTextForSearch(m?.teams)} ${m?.rawText || ''} ${m?.matchType || ''} ${m?.matchStatus || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [upcomingMatches, matchType, search]);

  const handleMatchTypeChange = (nextType) => {
    setMatchType(nextType);
    if (nextType === TYPE_IPL) {
      setActiveTab(TAB_TODAY);
      if (!iplSeasonHydratedRef.current) {
        iplSeasonHydratedRef.current = true;
        void loadMatches(true, { includeIplSeason: true, requestedType: TYPE_ALL });
      }
    }
  };

  const applySearchFilter = () => { setSearch(searchInput); };

  const dismissUpdateNotice = async () => {
    setShowUpdateNotice(false);
    try {
      await axiosInstance.post(
        `/api/auth/update-notice/${encodeURIComponent(DASHBOARD_UPDATE_VERSION)}/seen`
      );
    } catch {
      // Ignore best-effort errors; UI remains dismissed for this session.
    }
    if (forceShowUpdateNotice) {
      navigate(location.pathname, { replace: true });
    }
    setShowUpdateNotice(false);
  };

  return (
    <div className="grid gap-3">
      <Card title="Matches">
        {error && <Alert type="error">{error}</Alert>}

        <div className="flex flex-col gap-3">

        {/* Filter panel */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">

          {/* Tabs + Refresh */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab(TAB_TODAY)}
              className={`flex-1 h-9 rounded-xl text-[13px] font-semibold border transition-colors ${
                activeTab === TAB_TODAY
                  ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Live & Recent ({todayMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(TAB_UPCOMING)}
              className={`flex-1 h-9 rounded-xl text-[13px] font-semibold border transition-colors ${
                activeTab === TAB_UPCOMING
                  ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Upcoming ({upcomingMatches.length})
            </button>
            <button
              type="button"
              onClick={() => loadMatches(false, { includeIplSeason: matchType === TYPE_IPL, requestedType: TYPE_ALL })}
              disabled={loading}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c2 0 3.7.9 4.9 2.3L14 6" />
                <path d="M14 2.5V6h-3.5" />
              </svg>
            </button>
          </div>

          {/* Format pills */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Format</div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { type: TYPE_ALL,  label: 'All'  },
                { type: TYPE_IPL,  label: 'IPL'  },
                { type: TYPE_T20,  label: 'T20'  },
                { type: TYPE_ODI,  label: 'ODI'  },
                { type: TYPE_TEST, label: 'Test' },
              ].map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleMatchTypeChange(type)}
                  className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors ${
                    matchType === type
                      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Search</div>
            <div className="flex gap-2">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearchFilter()}
                placeholder="Team or match…"
                className="flex-1 h-9 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={applySearchFilter}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-[var(--brand)] text-white border border-[var(--brand)]"
              >
                Go
              </button>
            </div>
          </div>

        </div>

        {/* Match list */}
        {loading ? (
          <div className="text-[13px] text-slate-500 py-1">Loading matches...</div>
        ) : (
          activeTab === TAB_TODAY
            ? <MatchList matches={filteredTodayMatches} />
            : <MatchList matches={filteredUpcomingMatches} />
        )}

        </div>
      </Card>

      {showUpdateNotice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/25 p-3 sm:p-6">
          <div className="max-h-[85vh] w-[min(96vw,58rem)] overflow-y-auto rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3 shadow-xl sm:px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="font-semibold text-slate-900">New Update: Live Room Improvements</div>
                <div className="text-sm text-slate-700">
                  Live room flow is now faster and includes clearer match-start and timeout behavior.
                </div>

                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-800">What is included</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>Realtime live rooms between linked users</li>
                    <li>Online/offline visibility in Active Friends</li>
                    <li>Turn-based picking with instant sync for both users</li>
                    <li>Captain round support when enabled by ruleset</li>
                    <li>Room creator can choose who picks first (You or Opponent)</li>
                    <li>Live room auto-ends after 5 minutes, with a 1-minute remaining warning</li>
                    <li>Final lock requires confirmation from both users before freeze</li>
                    <li>Faster loading for create-room and team-building pages</li>
                  </ul>
                </div>

                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-800">How to link your friend (one-time setup)</div>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>Open Friends and create/open your friend entry.</li>
                    <li>Inside friend details, click Copy live invite.</li>
                    <li>Send that invite link to your friend.</li>
                    <li>Your friend opens the link and either registers (new account) or logs in (existing account).</li>
                    <li>After successful login/register through the invite, the friend link is connected automatically.</li>
                    <li>Now both of you can see each other in Active Friends and start live rooms.</li>
                  </ol>
                </div>

                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-800">How to use (step-by-step)</div>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>Open Friends, then switch to the Active Friends tab.</li>
                    <li>Choose an online linked user and start a live room.</li>
                    <li>Select ruleset, match, and who picks first, then create the room.</li>
                    <li>Both users mark Ready in the room.</li>
                    <li>Pick players turn-by-turn before the 5-minute room timer ends.</li>
                    <li>If captain mode is enabled, both users select captains.</li>
                    <li>Both users press Lock to freeze and create the final selection session.</li>
                  </ol>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
                  Tip: Use the i button in the header to open this update again anytime.
                </div>
              </div>
              <button
                type="button"
                onClick={dismissUpdateNotice}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardMatches;