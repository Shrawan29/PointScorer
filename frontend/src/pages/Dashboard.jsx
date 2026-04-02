import React, { useEffect, useMemo, useRef, useState } from 'react';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Card from '../components/Card.jsx';
import MatchList from '../components/MatchList.jsx';

const TAB_TODAY = 'TODAY';
const TAB_UPCOMING = 'UPCOMING';

const TYPE_ALL = 'ALL';
const TYPE_T20 = 'T20';
const TYPE_ODI = 'ODI';
const TYPE_TEST = 'TEST';
const TYPE_IPL = 'IPL';

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
	'kkr',
	'kolkata knight riders',
	'srh',
	'sunrisers hyderabad',
	'mi',
	'mumbai indians',
	'csk',
	'chennai super kings',
	'rcb',
	'royal challengers bengaluru',
	'royal challengers bangalore',
	'dc',
	'delhi capitals',
	'rr',
	'rajasthan royals',
	'pbks',
	'punjab kings',
	'kxip',
	'kings xi punjab',
	'lsg',
	'lucknow super giants',
	'gt',
	'gujarat titans',
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
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const requestSeqRef = useRef(0);
	const iplSeasonHydratedRef = useRef(false);
	const dataRef = useRef({ todayMatches: [], upcomingMatches: [] });

	const [activeTab, setActiveTab] = useState(TAB_TODAY);
	const [matchType, setMatchType] = useState(TYPE_ALL);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');

	const [data, setData] = useState({ todayMatches: [], upcomingMatches: [] });

	useEffect(() => {
		dataRef.current = data;
	}, [data]);

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

		let todayArray = [];
		let upcomingArray = [];
		const errors = [];

		const todayRequest = axiosInstance
			.get(todayUrl)
			.then((res) => (Array.isArray(res?.data) ? res.data : []))
			.catch((e) => {
				errors.push(e?.response?.data?.message || 'Failed to load today/live matches');
				return [];
			});

		const upcomingRequest = Promise.race([
			axiosInstance.get(upcomingUrl),
			new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)),
		])
			.then((res) => (Array.isArray(res?.data) ? res.data : []))
			.catch((e) => {
				errors.push(e?.response?.data?.message || 'Failed to load upcoming matches');
				return [];
			});

		todayArray = await todayRequest;
		const todayMatches = todayArray.map((m) => normalizeMatch(m, TAB_TODAY));
		if (typeof onPartialData === 'function') {
			onPartialData({ todayMatches });
		}

		upcomingArray = await upcomingRequest;
		const upcomingMatches = upcomingArray.map((m) => normalizeMatch(m, TAB_UPCOMING));
		return { nextData: { todayMatches, upcomingMatches }, errors };
	};

	const loadMatches = async (useCache = true, options = {}) => {
		const includeIplSeason = Boolean(options?.includeIplSeason);
		const requestedType = String(options?.requestedType || TYPE_ALL).toUpperCase();
		const cacheKey = `cricketMatchesCacheV4_${includeIplSeason ? 'ipl' : 'base'}_${requestedType}`;
		const reqId = (requestSeqRef.current += 1);

		// Manual refresh should show loading; background refresh shouldn't.
		if (!useCache) {
			setLoading(true);
			setError('');
		}
		try {
			// Try cache first - extended to 2 hours for slower API
			if (useCache) {
				const cachedRaw = sessionStorage.getItem(cacheKey);
				if (cachedRaw) {
					try {
						const cached = JSON.parse(cachedRaw);
						const age = Date.now() - Number(cached?.ts || 0);
						// Cache for 2 hours (7200000 ms)
						if (age >= 0 && age < 7200000 && cached?.data) {
							const today = Array.isArray(cached?.data?.todayMatches) ? cached.data.todayMatches : [];
							const upcoming = Array.isArray(cached?.data?.upcomingMatches) ? cached.data.upcomingMatches : [];
							const all = [...today, ...upcoming];
							const hasMissingType = all.length > 0 && all.some((m) => !m?.matchType);
							if (requestSeqRef.current === reqId) setData(cached.data);
							// If some formats are still missing on the ALL view, refresh in background.
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
										try {
											sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: res.nextData }));
										} catch {
											// ignore
										}
									} catch {
										// ignore background refresh failures
									}
								})();
							}
							return;
						}
					} catch {
						// ignore cache parse errors
					}
				}
			} else {
				// Clear cache if forcing refresh
				try {
					sessionStorage.removeItem(cacheKey);
				} catch {
					// ignore
				}
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
			try {
				sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: nextData }));
			} catch {
				// ignore
			}
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

	// Auto-refresh in the background while formats are still missing.
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

	useEffect(() => {
		setSearchInput(search);
	}, [search]);

	useEffect(() => {
		const t = setTimeout(() => {
			setSearch(searchInput);
		}, 150);
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

	const applySearchFilter = () => {
		setSearch(searchInput);
	};

	return (
		<Card title="Matches">
			{error && <Alert type="error">{error}</Alert>}

			<div className="flex flex-col gap-4">
				<div className="flex flex-col lg:flex-row lg:items-end gap-3">
					<div className="flex items-center gap-2 flex-wrap">
						<button
							type="button"
							onClick={() => setActiveTab(TAB_TODAY)}
							className={`px-3 py-2 rounded-md text-sm border ${
								activeTab === TAB_TODAY
									? 'bg-slate-900 text-white border-slate-900'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
							}`}
						>
							Recent & Live ({todayMatches.length})
						</button>
						<button
							type="button"
							onClick={() => setActiveTab(TAB_UPCOMING)}
							className={`px-3 py-2 rounded-md text-sm border ${
								activeTab === TAB_UPCOMING
									? 'bg-slate-900 text-white border-slate-900'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
							}`}
						>
							Upcoming ({upcomingMatches.length})
						</button>
						<button
							type="button"
							onClick={() => loadMatches(false, { includeIplSeason: matchType === TYPE_IPL, requestedType: TYPE_ALL })}
							disabled={loading}
							className="px-3 py-2 rounded-md text-sm border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 disabled:opacity-50"
							title="Clear cache and refresh"
						>
							{loading ? 'Loading...' : 'Refresh'}
						</button>
					</div>

					<div className="flex-1" />

					<div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
						<div>
							<div className="text-sm font-medium text-slate-700 mb-1">Match format</div>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => handleMatchTypeChange(TYPE_ALL)}
									className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
										matchType === TYPE_ALL
											? 'bg-slate-900 text-white border-slate-900'
											: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
									}`}
								>
									All
								</button>
								<button
									type="button"
									onClick={() => handleMatchTypeChange(TYPE_IPL)}
									className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
										matchType === TYPE_IPL
											? 'bg-slate-900 text-white border-slate-900'
											: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
									}`}
								>
									IPL
								</button>
								<button
									type="button"
									onClick={() => handleMatchTypeChange(TYPE_T20)}
									className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
										matchType === TYPE_T20
											? 'bg-slate-900 text-white border-slate-900'
											: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
									}`}
								>
									T20
								</button>
								<button
									type="button"
									onClick={() => handleMatchTypeChange(TYPE_ODI)}
									className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
										matchType === TYPE_ODI
											? 'bg-slate-900 text-white border-slate-900'
											: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
									}`}
								>
									ODI
								</button>
								<button
									type="button"
									onClick={() => handleMatchTypeChange(TYPE_TEST)}
									className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
										matchType === TYPE_TEST
											? 'bg-slate-900 text-white border-slate-900'
											: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
									}`}
								>
									Test
								</button>
							</div>
						</div>

						<div className="block">
							<div className="text-sm font-medium text-slate-700 mb-1">Search</div>
							<div className="flex gap-2">
								<input
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') applySearchFilter();
									}}
									placeholder="Search match or team"
									className="w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm"
								/>
								<button
									type="button"
									onClick={applySearchFilter}
									className="px-3 py-2 rounded-md text-sm border bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
								>
									Search
								</button>
							</div>
						</div>
					</div>
				</div>

				{loading ? (
					<div className="text-xs sm:text-sm text-slate-600">Loading matches...</div>
				) : (
					<div>
						{activeTab === TAB_TODAY ? (
							<MatchList matches={filteredTodayMatches} />
						) : (
							<MatchList matches={filteredUpcomingMatches} />
						)}
					</div>
				)}
			</div>
		</Card>
	);
};

export default DashboardMatches;
