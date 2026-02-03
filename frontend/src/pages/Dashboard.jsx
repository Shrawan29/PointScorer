import React, { useEffect, useMemo, useState } from 'react';

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

const normalizeType = (value) => {
	if (!value) return null;
	const v = String(value).toUpperCase();
	if (v.includes('T20')) return TYPE_T20;
	if (v.includes('ODI')) return TYPE_ODI;
	if (v.includes('TEST')) return TYPE_TEST;
	return v;
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
	return {
		matchId: derivedMatchId ?? null,
		matchName: match?.matchName ?? match?.name ?? null,
		teams,
		matchType: normalizeType(match?.matchType),
		matchStatus,
		startTime: match?.startTime ?? match?.startTimeText ?? null,
		matchUrl,
	};
};

export const DashboardMatches = () => {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const [activeTab, setActiveTab] = useState(TAB_TODAY);
	const [matchType, setMatchType] = useState(TYPE_ALL);
	const [search, setSearch] = useState('');

	const [data, setData] = useState({ todayMatches: [], upcomingMatches: [] });

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError('');
			try {
				// Session cache to avoid refetching every time user revisits dashboard
				const cachedRaw = sessionStorage.getItem('cricketMatchesCacheV1');
				if (cachedRaw) {
					try {
						const cached = JSON.parse(cachedRaw);
						const age = Date.now() - Number(cached?.ts || 0);
						if (age >= 0 && age < 60_000 && cached?.data) {
							if (!cancelled) setData(cached.data);
							setLoading(false);
							return;
						}
					} catch {
						// ignore cache parse errors
					}
				}

				let todayArray = [];
				let upcomingArray = [];
				const errors = [];

				try {
					const todayRes = await axiosInstance.get('/api/cricket/matches');
					const todayBody = todayRes?.data;
					todayArray = Array.isArray(todayBody) ? todayBody : [];
				} catch (e) {
					errors.push(e?.response?.data?.message || 'Failed to load today/live matches');
				}

				try {
					const upcomingRes = await axiosInstance.get('/api/cricket/matches/upcoming');
					const upcomingBody = upcomingRes?.data;
					upcomingArray = Array.isArray(upcomingBody) ? upcomingBody : [];
				} catch (e) {
					errors.push(e?.response?.data?.message || 'Failed to load upcoming matches');
				}

				const todayMatches = todayArray.map((m) => normalizeMatch(m, TAB_TODAY));
				const upcomingMatches = upcomingArray.map((m) => normalizeMatch(m, TAB_UPCOMING));

				const nextData = { todayMatches, upcomingMatches };
				if (!cancelled) setData(nextData);
				try {
					sessionStorage.setItem('cricketMatchesCacheV1', JSON.stringify({ ts: Date.now(), data: nextData }));
				} catch {
					// ignore
				}
				if (!cancelled && errors.length > 0 && todayMatches.length === 0 && upcomingMatches.length === 0) {
					setError(errors[0]);
				}
			} catch (err) {
				if (!cancelled) setError(err?.response?.data?.message || 'Failed to load matches');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const todayMatches = data.todayMatches || [];
	const upcomingMatches = data.upcomingMatches || [];

	const rawMatchesForTab = activeTab === TAB_TODAY ? todayMatches : upcomingMatches;

	const filteredMatches = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rawMatchesForTab.filter((m) => {
			const typeOk = matchType === TYPE_ALL || String(m?.matchType || '').toUpperCase() === matchType;
			if (!typeOk) return false;

			if (!q) return true;
			const haystack = `${m?.matchName || ''} ${teamsTextForSearch(m?.teams)}`.toLowerCase();
			return haystack.includes(q);
		});
	}, [rawMatchesForTab, matchType, search]);

	return (
		<Card title="Matches">
			{error && <Alert type="error">{error}</Alert>}

			<div className="flex flex-col gap-3">
				<div className="flex flex-col sm:flex-row sm:items-end gap-3">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setActiveTab(TAB_TODAY)}
							className={`px-3 py-2 rounded-md text-sm border ${
								activeTab === TAB_TODAY
									? 'bg-slate-900 text-white border-slate-900'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
							}`}
						>
							Today ({todayMatches.length})
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
					</div>

					<div className="flex-1" />

					<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
						<label className="block">
							<div className="text-sm font-medium text-slate-700 mb-1">Match type</div>
							<select
								value={matchType}
								onChange={(e) => setMatchType(e.target.value)}
								className="w-full sm:w-40 px-3 py-2 border rounded-md bg-white"
							>
								<option value={TYPE_ALL}>All</option>
								<option value={TYPE_T20}>T20</option>
								<option value={TYPE_ODI}>ODI</option>
								<option value={TYPE_TEST}>Test</option>
							</select>
						</label>

						<label className="block">
							<div className="text-sm font-medium text-slate-700 mb-1">Search</div>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search match or team"
								className="w-full sm:w-64 px-3 py-2 border rounded-md bg-white"
							/>
						</label>
					</div>
				</div>

				{loading ? (
					<div className="text-sm text-slate-600">Loading matches...</div>
				) : (
					<MatchList matches={filteredMatches} />
				)}
			</div>
		</Card>
	);
};

export default DashboardMatches;
