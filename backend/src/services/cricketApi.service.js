import axios from 'axios';

import cricketApiConfig from '../config/cricketApi.js';

const requireConfig = () => {
	if (!cricketApiConfig?.BASE_URL || !cricketApiConfig?.API_KEY || !cricketApiConfig?.API_HOST) {
		console.error('[CricketAPI] Missing env: CRICKET_API_BASE_URL / CRICKET_API_KEY / CRICKET_API_HOST');
		return false;
	}
	return true;
};

const apiClient = axios.create({
	baseURL: cricketApiConfig.BASE_URL,
	timeout: 20000,
	headers: {
		'X-RapidAPI-Key': cricketApiConfig.API_KEY,
		'X-RapidAPI-Host': cricketApiConfig.API_HOST,
	},
});

const safeGet = async (path, params, label) => {
	if (!requireConfig()) return null;

	try {
		const response = await apiClient.get(path, { params });
		return response?.data ?? null;
	} catch (error) {
		const status = error?.response?.status;
		const message =
			error?.response?.data?.message ||
			error?.response?.data?.error ||
			error?.message ||
			'RapidAPI request failed';
		console.error(`[CricketAPI] ${label} failed`, { status, message, path });
		return null;
	}
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeMatchType = (value) => {
	if (!value) return null;
	const v = String(value).toUpperCase();
	if (v.includes('T20')) return 'T20';
	if (v.includes('ODI')) return 'ODI';
	if (v.includes('TEST')) return 'TEST';
	return v;
};

const parseStartTime = (value) => {
	if (value == null) return null;
	const n = typeof value === 'number' ? value : Number(value);
	if (Number.isFinite(n) && n > 0) return n;

	const d = new Date(String(value));
	if (!Number.isNaN(d.getTime())) return d.toISOString();
	return String(value);
};

const collectMatchCandidates = (node, out, depth = 0) => {
	if (!node || depth > 8) return;
	if (Array.isArray(node)) {
		for (const item of node) collectMatchCandidates(item, out, depth + 1);
		return;
	}
	if (typeof node !== 'object') return;

	if (node.matchInfo && typeof node.matchInfo === 'object') {
		const matchId = node.matchInfo?.matchId;
		if (typeof matchId === 'number' || typeof matchId === 'string') {
			out.push(node);
		}
	}

	if (node.matchId && (node.team1 || node.team2)) {
		out.push(node);
	}

	for (const value of Object.values(node)) {
		collectMatchCandidates(value, out, depth + 1);
	}
};

const toTeam = (team) => {
	if (!team || typeof team !== 'object') return null;
	return {
		teamId: team.teamId ?? team.id ?? null,
		name: team.teamName ?? team.name ?? null,
		shortName: team.teamSName ?? team.shortName ?? team.sName ?? null,
	};
};

const toMatchSummary = (candidate, forcedStatus = null) => {
	const matchInfo = candidate?.matchInfo && typeof candidate.matchInfo === 'object' ? candidate.matchInfo : candidate;

	const matchId = matchInfo?.matchId ?? null;
	const matchDesc = matchInfo?.matchDesc ?? matchInfo?.matchDescription ?? matchInfo?.matchName ?? null;
	const seriesName = matchInfo?.seriesName ?? matchInfo?.series?.name ?? null;
	const matchName = seriesName && matchDesc ? `${seriesName} - ${matchDesc}` : matchDesc || seriesName || null;

	const team1 = toTeam(matchInfo?.team1);
	const team2 = toTeam(matchInfo?.team2);

	const matchType = normalizeMatchType(
		matchInfo?.matchFormat || matchInfo?.matchType || matchInfo?.matchFormatDesc || matchInfo?.matchTypeDesc
	);
	const startTime = parseStartTime(
		matchInfo?.startDate || matchInfo?.startTime || matchInfo?.startDateTime || matchInfo?.startTimeEpoch
	);

	const matchStatus = forcedStatus ||
		matchInfo?.status ||
		matchInfo?.statusText ||
		matchInfo?.state ||
		candidate?.status ||
		candidate?.matchStatus ||
		candidate?.statusText ||
		null;

	return {
		matchId: matchId != null ? String(matchId) : null,
		matchName,
		teams: [team1, team2].filter(Boolean),
		matchType,
		matchStatus,
		startTime,
	};
};

const uniqueByMatchId = (matches) => {
	const seen = new Set();
	const out = [];
	for (const m of asArray(matches)) {
		const id = m?.matchId;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(m);
	}
	return out;
};

const parseMatchesResponse = (data, forcedStatus = null) => {
	const candidates = [];
	collectMatchCandidates(data, candidates);
	const summaries = candidates.map((c) => toMatchSummary(c, forcedStatus)).filter((m) => m?.matchId);
	return uniqueByMatchId(summaries);
};

const normalizePlayer = (p) => {
	if (!p || typeof p !== 'object') return null;
	return {
		playerId: p.id ?? p.playerId ?? p.faceImageId ?? p.batId ?? p.bowlId ?? null,
		name: p.name ?? p.fullName ?? p.playerName ?? p.batName ?? p.bowlName ?? null,
		role: p.role ?? p.speciality ?? p.playingRole ?? null,
		isCaptain: Boolean(p.isCaptain || p.captain || p.isC),
		isKeeper: Boolean(p.isKeeper || p.keeper || p.isWk),
	};
};

const parseTeamsResponse = (matchId, data) => {
	const teams = [];
	const maybeTeams = asArray(data?.teams) || asArray(data?.team) || asArray(data?.teamDetails) || [];

	for (const t of maybeTeams) {
		const teamInfo = t?.team || t;
		const team = toTeam(teamInfo);
		const players =
			asArray(t?.players) || asArray(t?.player) || asArray(t?.squad) || asArray(teamInfo?.players) || [];
		teams.push({
			...team,
			players: players.map(normalizePlayer).filter((x) => x?.name),
		});
	}

	if (teams.length === 0) {
		const stack = [data];
		while (stack.length) {
			const node = stack.pop();
			if (!node || typeof node !== 'object') continue;
			if (Array.isArray(node)) {
				for (const v of node) stack.push(v);
				continue;
			}

			const hasTeamName = typeof node?.teamName === 'string' || typeof node?.teamSName === 'string';
			if (hasTeamName && Array.isArray(node?.players)) {
				teams.push({
					...toTeam(node),
					players: node.players.map(normalizePlayer).filter((x) => x?.name),
				});
			}

			for (const v of Object.values(node)) stack.push(v);
		}
	}

	return {
		matchId: String(matchId),
		teams,
	};
};

const valuesOfObject = (obj) => {
	if (!obj || typeof obj !== 'object') return [];
	return Object.values(obj);
};

const toNumberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const parseScorecardResponse = (matchId, data) => {
	const match = data?.matchHeader || data?.match || data?.matchInfo || null;
	const matchName = match?.matchDescription || match?.matchDesc || match?.matchName || data?.matchName || null;
	const matchStatus = match?.status || match?.statusText || match?.state || data?.status || data?.matchStatus || data?.statusText || null;

	const team1 = toTeam(match?.team1 || data?.team1);
	const team2 = toTeam(match?.team2 || data?.team2);

	const innings = [];
	const scoreCards = asArray(data?.scoreCard || data?.scorecard || data?.innings);

	for (const sc of scoreCards) {
		const scoreDetails = sc?.scoreDetails || sc?.score || {};
		const batTeam = sc?.batTeamDetails || {};
		const bowlTeam = sc?.bowlTeamDetails || {};

		const batsmen = valuesOfObject(batTeam?.batsmenData)
			.map((b) => ({
				playerId: b?.batId ?? null,
				name: b?.batName ?? null,
				runs: toNumberOrNull(b?.runs),
				balls: toNumberOrNull(b?.balls),
				fours: toNumberOrNull(b?.fours),
				sixes: toNumberOrNull(b?.sixes),
				strikeRate: toNumberOrNull(b?.strikeRate),
				outDesc: b?.outDesc ?? null,
			}))
			.filter((b) => b?.name);

		const bowlers = valuesOfObject(bowlTeam?.bowlersData)
			.map((bw) => ({
				playerId: bw?.bowlerId ?? null,
				name: bw?.bowlName ?? bw?.bowlerName ?? null,
				overs: toNumberOrNull(bw?.overs),
				maidens: toNumberOrNull(bw?.maidens),
				runs: toNumberOrNull(bw?.runs),
				wickets: toNumberOrNull(bw?.wickets),
				economy: toNumberOrNull(bw?.economy),
			}))
			.filter((bw) => bw?.name);

		innings.push({
			inningsId: sc?.inningsId ?? null,
			inningsName: sc?.inningsName ?? batTeam?.batTeamName ?? null,
			battingTeam: {
				teamId: batTeam?.batTeamId ?? null,
				name: batTeam?.batTeamName ?? null,
				shortName: batTeam?.batTeamSName ?? null,
			},
			bowlingTeam: {
				teamId: bowlTeam?.bowlTeamId ?? null,
				name: bowlTeam?.bowlTeamName ?? null,
				shortName: bowlTeam?.bowlTeamSName ?? null,
			},
			total: {
				runs: toNumberOrNull(scoreDetails?.runs),
				wickets: toNumberOrNull(scoreDetails?.wickets),
				overs: scoreDetails?.overs ?? null,
			},
			batting: batsmen,
			bowling: bowlers,
		});
	}

	return {
		matchId: String(matchId),
		matchName,
		matchStatus,
		status: matchStatus,
		teams: [team1, team2].filter(Boolean),
		innings,
	};
};

// Using exact RapidAPI endpoints as specified
export const getTodayAndLiveMatches = async () => {
	const [live, recent] = await Promise.all([
		safeGet('/matches/live', null, 'matches_live'),
		safeGet('/matches/recent', null, 'matches_recent'),
	]);

	const liveMatches = parseMatchesResponse(live, 'LIVE');
	const todayMatches = parseMatchesResponse(recent, 'TODAY');
	const merged = [...liveMatches, ...todayMatches];
	return uniqueByMatchId(merged);
};

export const getUpcomingMatches = async () => {
	const data = await safeGet('/matches/upcoming', null, 'matches_upcoming');
	return parseMatchesResponse(data, 'UPCOMING');
};

export const getMatchDetails = async (matchId) => {
	if (!matchId) return null;
	const data = await safeGet('/matches/get-info', { matchId }, 'match_info');
	if (!data) return null;

	const match = data?.matchInfo || data?.match || data;
	const matchName = match?.matchDesc || match?.matchDescription || match?.matchName || null;
	const venue = match?.venue?.name || match?.venue || match?.venueName || null;
	const matchType = normalizeMatchType(match?.matchFormat || match?.matchType);
	const startTime = parseStartTime(match?.startDate || match?.startTime || match?.startDateTime);
	const status = match?.status || match?.statusText || match?.state || null;
	const team1 = toTeam(match?.team1);
	const team2 = toTeam(match?.team2);

	return {
		matchId: String(matchId),
		matchName,
		teams: [team1, team2].filter(Boolean),
		venue,
		matchType,
		startTime,
		status,
	};
};

export const getMatchTeams = async (matchId) => {
	if (!matchId) return null;
	const data = await safeGet('/matches/get-team', { matchId }, 'match_teams');
	if (!data) return null;
	return parseTeamsResponse(matchId, data);
};

export const getMatchScorecard = async (matchId) => {
	if (!matchId) return null;
	const data = await safeGet('/matches/get-scorecard', { matchId }, 'match_scorecard');
	if (!data) return null;
	return parseScorecardResponse(matchId, data);
};

export default {
	getTodayAndLiveMatches,
	getUpcomingMatches,
	getMatchDetails,
	getMatchTeams,
	getMatchScorecard,
};
