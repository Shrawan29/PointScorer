import axios from 'axios';
import cheerio from 'cheerio';

const SCRAPER_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 15000);
const SCRAPER_DELAY_MS = Number(process.env.SCRAPER_DELAY_MS || 3000);
const MATCH_LIST_SCRAPER_DELAY_MS = Number(process.env.MATCH_LIST_SCRAPER_DELAY_MS || 250);

const MATCH_LIST_CACHE_TTL_MS = Number(process.env.MATCH_LIST_CACHE_TTL_MS || 60_000);
const MATCH_FORMAT_CACHE_TTL_MS = Number(process.env.MATCH_FORMAT_CACHE_TTL_MS || 6 * 60 * 60_000);
const SQUADS_CACHE_TTL_MS = Number(process.env.SQUADS_CACHE_TTL_MS || 5 * 60_000);
const SCORECARD_STATS_CACHE_TTL_MS = Number(process.env.SCORECARD_STATS_CACHE_TTL_MS || 60_000);
const LIVE_TODAY_RECENT_RETENTION_MS = Number(process.env.LIVE_TODAY_RECENT_RETENTION_MS || 36 * 60 * 60_000);
const IPL_RECENT_EDITION_CACHE_TTL_MS = Number(process.env.IPL_RECENT_EDITION_CACHE_TTL_MS || 10 * 60_000);

// MANDATORY HEADERS (must be set exactly as requested)
const CRICBUZZ_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
	'Accept': 'text/html',
	'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Delay execution to avoid aggressive scraping
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple in-memory caches (per process)
const matchListCache = {
	liveToday: { ts: 0, data: [] },
	upcoming: { ts: 0, data: [] },
};

const squadsCache = new Map();
const scorecardStatsCache = new Map();
const matchFormatCache = new Map();
const recentLiveTodayMatches = new Map();
const iplRecentEditionCache = { ts: 0, data: [] };

/**
 * Safely fetch HTML page with debug logging
 */
const fetchPage = async (url, label = 'fetch') => {
	try {
		console.log(`[Scraper] ${label}: Requesting ${url}`);
		const response = await axios.get(url, {
			timeout: SCRAPER_TIMEOUT_MS,
			maxRedirects: 5,
			headers: CRICBUZZ_HEADERS,
			validateStatus: () => true,
		});
		const status = response?.status;
		const html = typeof response?.data === 'string' ? response.data : '';

		console.log(`[Scraper] ${label}: HTTP status: ${status}`);
		console.log(`[Scraper] ${label}: HTML length: ${html.length}`);

		if (status !== 200) {
			console.warn(`[Scraper] ${label}: Non-200 status (${status}) for ${url}`);
			return null;
		}

		return html;
	} catch (error) {
		const status = error?.response?.status;
		const message = error?.message || 'Request failed';
		console.error(`[Scraper] ${label} failed - Status: ${status}, Message: ${message}, URL: ${url}`);
		return null;
	}
};

const normalizeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const getCachedMatchFormat = (url) => {
	const entry = matchFormatCache.get(url);
	if (!entry) return null;
	if (Date.now() - entry.ts > MATCH_FORMAT_CACHE_TTL_MS) {
		matchFormatCache.delete(url);
		return null;
	}
	return entry.format || null;
};

const setCachedMatchFormat = (url, format) => {
	if (!url || !format) return;
	matchFormatCache.set(url, { ts: Date.now(), format });
};

const absoluteCricbuzzUrl = (href) => {
	if (!href) return null;
	if (href.startsWith('http://') || href.startsWith('https://')) return href;
	return `https://www.cricbuzz.com${href.startsWith('/') ? '' : '/'}${href}`;
};

const extractMatchIdFromUrl = (value) => {
	if (!value) return null;
	const s = String(value);
	const m = s.match(/\/live-cricket-scores\/(\d+)\//i) || s.match(/\/cricket-scores\/(\d+)\//i);
	return m?.[1] || null;
};

const getLiveTodayMatchKey = (match) => {
	const matchId = String(match?.matchId || extractMatchIdFromUrl(match?.matchUrl) || '').trim();
	if (matchId) return `id:${matchId}`;

	const url = normalizeWhitespace(match?.matchUrl);
	if (url) return `url:${url}`;

	const name = normalizeWhitespace(match?.matchName);
	const team1 = normalizeWhitespace(match?.team1);
	const team2 = normalizeWhitespace(match?.team2);
	if (name || team1 || team2) return `name:${name}|${team1}|${team2}`;

	return null;
};

const mergeLiveTodayMatch = (prev = {}, next = {}) => ({
	...prev,
	...next,
	matchType: next?.matchType || prev?.matchType || null,
	rawText: next?.rawText || prev?.rawText || null,
});

const rememberLiveTodayMatches = (matches, now = Date.now()) => {
	for (const match of Array.isArray(matches) ? matches : []) {
		const key = getLiveTodayMatchKey(match);
		if (!key) continue;

		const prev = recentLiveTodayMatches.get(key);
		recentLiveTodayMatches.set(key, {
			match: mergeLiveTodayMatch(prev?.match, match),
			lastSeenAt: now,
		});
	}
};

const collectRetainedLiveTodayMatches = (currentMatches, now = Date.now()) => {
	const currentKeys = new Set();
	for (const match of Array.isArray(currentMatches) ? currentMatches : []) {
		const key = getLiveTodayMatchKey(match);
		if (key) currentKeys.add(key);
	}

	const retained = [];
	for (const [key, entry] of recentLiveTodayMatches.entries()) {
		if (!entry?.match || !entry?.lastSeenAt) {
			recentLiveTodayMatches.delete(key);
			continue;
		}

		if (now - Number(entry.lastSeenAt) > LIVE_TODAY_RECENT_RETENTION_MS) {
			recentLiveTodayMatches.delete(key);
			continue;
		}

		if (currentKeys.has(key)) continue;

		retained.push({
			...entry.match,
			// Retained entries are no longer live on source page.
			matchStatus: entry.match?.matchStatus === 'LIVE' ? 'TODAY' : entry.match?.matchStatus || 'TODAY',
			isRetainedRecent: true,
		});
	}

	return retained;
};

const dedupeMatchesByKey = (matches) => {
	const out = [];
	const seen = new Set();

	for (const match of Array.isArray(matches) ? matches : []) {
		const key = getLiveTodayMatchKey(match) || `anon:${normalizeWhitespace(match?.matchName)}|${normalizeWhitespace(match?.rawText)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(match);
	}

	return out;
};

const uniqueStrings = (arr) => {
	const out = [];
	const seen = new Set();
	for (const v of Array.isArray(arr) ? arr : []) {
		const s = normalizeWhitespace(v);
		if (!s) continue;
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
};

const STAFF_ROLE_RE = /\b(coaches?|assistant\s+coaches?|head\s+coaches?|batting\s+coaches?|bowling\s+coaches?|fielding\s+coaches?|mentor|manager|team\s+manager|physio|physiotherapist|trainer|analyst|support\s+staff|staff|team\s+doctor|masseur|selector|consultant|director|scout)\b/i;
const META_PLAYER_LABEL_RE = /\b(playing\s*xi|xi\s*declared|line\s*-?\s*up|lineup|squad|substitutes?|reserves?|impact\s+players?)\b/i;

const sanitizePlayerName = (value) => {
	const raw = normalizeWhitespace(value);
	if (!raw) return '';

	const roleSuffixRe =
		/(?:wk\s*[-/]?\s*batter|wicket\s*[-/]?\s*keeper(?:\s*[-/]?\s*batter)?|batting\s*all\s*[-/]?\s*rounder|bowling\s*all\s*[-/]?\s*rounder|all\s*[-/]?\s*rounder|batter|bowler)$/i;

	const cleaned = raw
		.replace(/^[\d\s.)\-•*]+/, '')
		.replace(/[\u2020†*]/g, '')
		.replace(/\[(?:c|vc|wk|wk\/c|c\/wk|captain|vice\s*captain|sub|substitute|reserve|impact\s*player)\]/gi, '')
		.replace(/\((?:c|vc|wk|wk\/c|c\/wk|captain|vice\s*captain|sub|substitute|reserve|impact\s*player)\)/gi, '')
		.replace(/\((?:[^)]*\b(?:coaches?|physio|physiotherapist|trainer|analyst|manager|mentor|support\s*staff|team\s*doctor|masseur|selector|consultant|director|scout)\b[^)]*)\)/gi, '')
		.replace(/\s*[-:]\s*(?:captain|vice\s*captain|wicket\s*-?\s*keeper)\b.*$/i, '')
		.replace(/,\s*(?:captain|vice\s*captain|wicket\s*-?\s*keeper)\b.*$/i, '')
		// Some squad pages glue role to the player name (e.g. "Sanju SamsonWK-Batter").
		.replace(/([a-z])((?:wk|WK|Wk)\s*[-/]?\s*batter|wicket\s*[-/]?\s*keeper(?:\s*[-/]?\s*batter)?|batting\s*all\s*[-/]?\s*rounder|bowling\s*all\s*[-/]?\s*rounder|all\s*[-/]?\s*rounder|batter|bowler)$/i, '$1 $2')
		.replace(new RegExp(`\\s*${roleSuffixRe.source}`, 'i'), '')
		.replace(/[,:;]+$/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (!cleaned) return '';
	if (STAFF_ROLE_RE.test(cleaned)) return '';
	if (META_PLAYER_LABEL_RE.test(cleaned) && cleaned.length <= 50) return '';
	if (!/[A-Za-z]/.test(cleaned)) return '';
	if (cleaned.length < 2 || cleaned.length > 45) return '';

	return cleaned;
};

const isLikelyStaffContext = (value) => STAFF_ROLE_RE.test(normalizeWhitespace(value));

const normalizePlayerKey = (value) =>
	normalizeWhitespace(value)
		.replace(/[\u2020†*]/g, '')
		.replace(/\[(?:[^\]]*)\]/g, '')
		.replace(/\((?:[^)]*)\)/g, '')
		.replace(/[,]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

const uniquePlayers = (arr) => {
	const out = [];
	const seen = new Set();

	for (const raw of Array.isArray(arr) ? arr : []) {
		const cleaned = sanitizePlayerName(raw);
		if (!cleaned) continue;

		const key = normalizePlayerKey(cleaned);
		if (!key || seen.has(key)) continue;

		seen.add(key);
		out.push(cleaned);
	}

	return out;
};

const SUPPORT_STAFF_GROUP_RE = /\b(support\s*staff|coaches?|assistant\s+coach(?:es)?|head\s+coach(?:es)?|bowling\s+coach(?:es)?|batting\s+coach(?:es)?|fielding\s+coach(?:es)?|mentor|manager|team\s+manager|physio|physiotherapist|trainer|analyst|staff|team\s+doctor|masseur|consultant|director|scout|advisor|strategic\s+advisor)\b/i;

const isSupportStaffGroupLabel = (value) => SUPPORT_STAFF_GROUP_RE.test(normalizeWhitespace(value));

const isSupportStaffRole = (value) => STAFF_ROLE_RE.test(normalizeWhitespace(value));

const isLikelyCompletedMatch = (matchLike) => {
	const status = normalizeWhitespace(matchLike?.matchStatus).toLowerCase();
	const text = normalizeWhitespace(`${matchLike?.rawText || ''} ${matchLike?.matchName || ''}`).toLowerCase();
	const hay = `${status} ${text}`;

	if (/\b(upcoming|preview|scheduled|match\s+starts|starts\s+in|yet\s+to\s+begin|to\s+begin|not\s+started)\b/.test(hay)) {
		return false;
	}

	if (/\b(live|in\s*progress|toss|stumps?|innings|opt\s+to\s+bat)\b/.test(hay)) {
		return false;
	}

	if (/\b(completed?|result|won\s+by|beat\s+by|no\s+result|abandoned?|tied|drawn|match\s+over)\b/.test(hay)) {
		return true;
	}

	return false;
};

const splitPlayersList = (value) => {
	if (!value) return [];
	return uniquePlayers(
		String(value)
			.split(/,|\u2022|\||\r?\n/)
			.map((s) => normalizeWhitespace(s))
			.filter(Boolean),
	);
};

const inc = (obj, key, by = 1) => {
	const k = normalizeWhitespace(key);
	if (!k) return;
	// eslint-disable-next-line no-param-reassign
	obj[k] = (obj[k] || 0) + (Number(by) || 0);
};

const parseDismissalForFielding = (dismissal, catchesByFielder, runoutsByFielder) => {
	const d = normalizeWhitespace(dismissal);
	if (!d) return;

	// Caught & bowled
	const cab = d.match(/\bc\s*&\s*b\s+([^,]+)$/i);
	if (cab?.[1]) {
		inc(catchesByFielder, cab[1], 1);
		return;
	}

	// Caught: "c Fielder b Bowler"
	const c = d.match(/\bc\s+([^,]+?)\s+\bb\b/i);
	if (c?.[1]) {
		inc(catchesByFielder, c[1], 1);
		return;
	}

	// Run out: "run out (Fielder)"
	const ro = d.match(/run\s*out\s*\(([^)]+)\)/i);
	if (ro?.[1]) {
		const raw = ro[1];
		const first = String(raw)
			.split(/\s*\/\s*|\s*,\s*|\s*&\s*/)
			.map((x) => normalizeWhitespace(x))
			.filter(Boolean)[0];
		if (first) inc(runoutsByFielder, first, 1);
	}
};

export const scrapeCricbuzzScorecardPlayerStats = async (matchId) => {
	try {
		const id = String(matchId || '').trim();
		if (!id) return null;

		const cached = scorecardStatsCache.get(id);
		if (cached && Date.now() - cached.ts < SCORECARD_STATS_CACHE_TTL_MS) {
			return cached.data;
		}

		await delay(SCRAPER_DELAY_MS);

		const urlCandidates = uniqueStrings([
			// This page currently contains embedded scorecard JSON in Next.js flight payload.
			`https://www.cricbuzz.com/live-cricket-scorecard/${id}`,
			// Fallbacks (may load commentary-first and not include scorecard JSON server-side)
			`https://www.cricbuzz.com/live-cricket-scores/${id}/scorecard`,
			`https://www.cricbuzz.com/cricket-scores/${id}/scorecard`,
		]);

		const { url: sourceUrl, html } = await tryFetchFirstWorking(urlCandidates, `cricbuzz_scorecard_${id}`);
		if (!html) return null;

		// Extract scorecardApiData from Next.js flight chunks.
		const extractFlightStrings = (rawHtml) => {
			const s = String(rawHtml || '');
			// Capture JS string literal content, allowing escaped quotes/backslashes.
			const re = /self\.__next_f\.push\(\[\s*(\d+)\s*,\s*"((?:\\[\s\S]|[^"\\])*)"\s*\]\)\s*;?/g;
			const out = [];
			for (const m of s.matchAll(re)) {
				const raw = m[2];
				let decoded;
				try {
					decoded = JSON.parse(`"${raw}"`);
				} catch {
					decoded = raw;
				}
				out.push(decoded);
			}
			return out;
		};

		const sliceBalancedJson = (text, startIndex) => {
			const s = String(text || '');
			let i = startIndex;
			while (i < s.length && s[i] !== '{' && s[i] !== '[') i += 1;
			if (i >= s.length) return null;
			const open = s[i];
			const close = open === '{' ? '}' : ']';
			let depth = 0;
			let inString = false;
			let esc = false;
			for (let j = i; j < s.length; j += 1) {
				const ch = s[j];
				if (inString) {
					if (esc) {
						esc = false;
						continue;
					}
					if (ch === '\\') {
						esc = true;
						continue;
					}
					if (ch === '"') inString = false;
					continue;
				}
				if (ch === '"') {
					inString = true;
					continue;
				}
				if (ch === open) depth += 1;
				if (ch === close) depth -= 1;
				if (depth === 0) return s.slice(i, j + 1);
			}
			return null;
		};

		const flightStrings = extractFlightStrings(html);
		let scorecardApiData = null;
		for (const str of flightStrings) {
			const marker = '"scorecardApiData":';
			const idx = String(str).indexOf(marker);
			if (idx === -1) continue;
			const valueJson = sliceBalancedJson(str, idx + marker.length);
			if (!valueJson) continue;
			try {
				scorecardApiData = JSON.parse(valueJson);
				break;
			} catch {
				// Keep searching other chunks
			}
		}

		if (!scorecardApiData || !Array.isArray(scorecardApiData.scoreCard)) {
			console.warn('[Scraper] scorecardApiData.scoreCard not found in HTML');
			return null;
		}

		const toInt = (v) => {
			const n = typeof v === 'number' ? v : parseInt(String(v || '0'), 10);
			return Number.isFinite(n) ? n : 0;
		};

		const playerNameById = {};
		const rememberName = (playerId, name, options = {}) => {
			const pid = String(playerId || '').trim();
			const nm = normalizeWhitespace(name);
			if (!pid || !nm) return;
			if (!playerNameById[pid] || options?.force === true) playerNameById[pid] = nm;
		};

		const playerTeamById = {};
		const toTeamInfo = (teamLike) => {
			if (!teamLike || typeof teamLike !== 'object') return null;

			const teamId = toInt(
				teamLike?.batTeamId ||
				teamLike?.bowlTeamId ||
				teamLike?.teamId ||
				teamLike?.id,
			);
			const teamName = normalizeWhitespace(
				teamLike?.batTeamName ||
				teamLike?.bowlTeamName ||
				teamLike?.teamName ||
				teamLike?.name ||
				'',
			);
			const teamShortName = normalizeWhitespace(
				teamLike?.batTeamShortName ||
				teamLike?.bowlTeamShortName ||
				teamLike?.batTeamSName ||
				teamLike?.bowlTeamSName ||
				teamLike?.shortName ||
				'',
			);

			if (!teamId && !teamName && !teamShortName) return null;
			return {
				teamId: teamId || null,
				teamName: teamName || null,
				teamShortName: teamShortName || null,
			};
		};

		const rememberTeam = (playerId, teamInfo) => {
			const pid = String(playerId || '').trim();
			if (!pid || !teamInfo) return;
			if (!playerTeamById[pid]) {
				playerTeamById[pid] = teamInfo;
				return;
			}

			const prev = playerTeamById[pid];
			playerTeamById[pid] = {
				teamId: prev?.teamId || teamInfo?.teamId || null,
				teamName: prev?.teamName || teamInfo?.teamName || null,
				teamShortName: prev?.teamShortName || teamInfo?.teamShortName || null,
			};
		};

		// Best-effort: traverse scorecardApiData to find any (id,name) pairs.
		const collectIdNamePairs = (root) => {
			const maxNodes = 200000;
			let seenNodes = 0;
			const stack = [root];
			const seen = new Set();
			while (stack.length) {
				const node = stack.pop();
				if (!node || (typeof node !== 'object' && typeof node !== 'function')) continue;
				if (seen.has(node)) continue;
				seen.add(node);
				seenNodes += 1;
				if (seenNodes > maxNodes) break;

				if (Array.isArray(node)) {
					for (const child of node) stack.push(child);
					continue;
				}

				// Common Cricbuzz shapes
				if (node.batId && node.batName) rememberName(node.batId, node.batName);
				if (node.bowlerId && (node.bowlerName || node.bowlName)) rememberName(node.bowlerId, node.bowlerName || node.bowlName);
				if (node.playerId && node.playerName) rememberName(node.playerId, node.playerName);
				if (node.id && node.name && typeof node.id !== 'object') rememberName(node.id, node.name);

				for (const v of Object.values(node)) stack.push(v);
			}
		};

		collectIdNamePairs(scorecardApiData);

		const statsByPlayerId = new Map();
		const bump = (playerId, patch) => {
			const pid = String(playerId || '').trim();
			if (!pid) return;
			const prev = statsByPlayerId.get(pid) || {
				playerId: pid,
				runs: 0,
				fours: 0,
				sixes: 0,
				wickets: 0,
				catches: 0,
				runouts: 0,
			};
			statsByPlayerId.set(pid, {
				...prev,
				runs: prev.runs + toInt(patch.runs),
				fours: prev.fours + toInt(patch.fours),
				sixes: prev.sixes + toInt(patch.sixes),
				wickets: prev.wickets + toInt(patch.wickets),
				catches: prev.catches + toInt(patch.catches),
				runouts: prev.runouts + toInt(patch.runouts),
			});
		};

		const isCatchCode = (code) => {
			const c = String(code || '').toUpperCase();
			return c.includes('CAUGHT');
		};
		const isRunoutCode = (code) => String(code || '').toUpperCase().includes('RUNOUT');

		for (const innings of scorecardApiData.scoreCard) {
			const batTeamInfo = toTeamInfo(innings?.batTeamDetails);
			const bowlTeamInfo = toTeamInfo(innings?.bowlTeamDetails);

			const batsmenData = innings?.batTeamDetails?.batsmenData || {};
			for (const b of Object.values(batsmenData)) {
				if (!b || !b.batId) continue;
				rememberName(b.batId, b.batName || b.batShortName, { force: true });
				rememberTeam(b.batId, batTeamInfo);
				bump(b.batId, { runs: b.runs, fours: b.fours, sixes: b.sixes });

				const wicketCode = b.wicketCode;
				const f1 = toInt(b.fielderId1);
				const f2 = toInt(b.fielderId2);
				if (isCatchCode(wicketCode)) {
					if (f1 > 0) {
						bump(f1, { catches: 1 });
						rememberTeam(f1, bowlTeamInfo);
					}
				} else if (isRunoutCode(wicketCode)) {
					if (f1 > 0) {
						bump(f1, { runouts: 1 });
						rememberTeam(f1, bowlTeamInfo);
					}
					if (f2 > 0 && f2 !== f1) {
						bump(f2, { runouts: 1 });
						rememberTeam(f2, bowlTeamInfo);
					}
				}
			}

			const bowlersData = innings?.bowlTeamDetails?.bowlersData || {};
			for (const bw of Object.values(bowlersData)) {
				if (!bw || !bw.bowlerId) continue;
				rememberName(bw.bowlerId, bw.bowlerName || bw.bowlName || bw.bowlerShortName, { force: true });
				rememberTeam(bw.bowlerId, bowlTeamInfo);
				bump(bw.bowlerId, { wickets: bw.wickets });
			}
		}

		const playerStatsById = {};
		for (const [pid, s] of statsByPlayerId.entries()) {
			playerStatsById[pid] = {
				playerId: pid,
				runs: toInt(s.runs),
				fours: toInt(s.fours),
				sixes: toInt(s.sixes),
				wickets: toInt(s.wickets),
				catches: toInt(s.catches),
				runouts: toInt(s.runouts),
			};
		}

		const data = {
			matchId: id,
			sourceUrl,
			playerStatsById,
			playerNameById,
			playerTeamById,
			matchHeader: scorecardApiData?.matchHeader || null,
		};

		scorecardStatsCache.set(id, { ts: Date.now(), data });
		return data;
	} catch (error) {
		console.error('[Scraper] scrapeCricbuzzScorecardPlayerStats failed:', error?.message);
		return null;
	}
};

const tryFetchFirstWorking = async (candidates, label) => {
	for (const url of candidates) {
		// eslint-disable-next-line no-await-in-loop
		const html = await fetchPage(url, label);
		if (html) return { url, html };
	}
	return { url: null, html: null };
};

const extractFlightStringsFromHtml = (rawHtml) => {
	const s = String(rawHtml || '');
	const re = /self\.__next_f\.push\(\[\s*(\d+)\s*,\s*"((?:\\[\s\S]|[^"\\])*)"\s*\]\)\s*;?/g;
	const out = [];
	for (const m of s.matchAll(re)) {
		const raw = m[2];
		let decoded;
		try {
			decoded = JSON.parse(`"${raw}"`);
		} catch {
			decoded = raw;
		}
		out.push(decoded);
	}
	return out;
};

const sliceBalancedJsonFromText = (text, startIndex) => {
	const s = String(text || '');
	let i = startIndex;
	while (i < s.length && s[i] !== '{' && s[i] !== '[') i += 1;
	if (i >= s.length) return null;

	const open = s[i];
	const close = open === '{' ? '}' : ']';
	let depth = 0;
	let inString = false;
	let esc = false;

	for (let j = i; j < s.length; j += 1) {
		const ch = s[j];
		if (inString) {
			if (esc) {
				esc = false;
				continue;
			}
			if (ch === '\\') {
				esc = true;
				continue;
			}
			if (ch === '"') inString = false;
			continue;
		}

		if (ch === '"') {
			inString = true;
			continue;
		}

		if (ch === open) depth += 1;
		if (ch === close) depth -= 1;
		if (depth === 0) return s.slice(i, j + 1);
	}

	return null;
};

const scrapeCricbuzzSquadsAndPlayingXIFromMatchUrl = async (matchUrl, options = {}) => {
	if (!matchUrl) return null;
	await delay(SCRAPER_DELAY_MS);
	const preferSquadOnly = options?.preferSquadOnly === true;

	const teamsFromUrl = extractTeamsFromMatchUrlSlug(matchUrl);
	const team1Name = normalizeWhitespace(options?.team1Name || teamsFromUrl?.team1 || '') || null;
	const team2Name = normalizeWhitespace(options?.team2Name || teamsFromUrl?.team2 || '') || null;
	let resolvedTeam1Label = team1Name;
	let resolvedTeam2Label = team2Name;

	const matchId = extractMatchIdFromUrl(matchUrl);
	const base = String(matchUrl);
	const urlCandidates = [];

	// Prefer squads pages first for cleaner team-wise player extraction.
	if (base.includes('/live-cricket-scores/')) {
		urlCandidates.push(`${base}/squads`);
		urlCandidates.push(`${base.replace('/live-cricket-scores/', '/cricket-scores/')}/squads`);
		urlCandidates.push(base);
		urlCandidates.push(base.replace('/live-cricket-scores/', '/cricket-scores/'));
		urlCandidates.push(`${base}/scorecard`);
	} else {
		urlCandidates.push(base);
	}
	if (matchId) {
		urlCandidates.push(`https://www.cricbuzz.com/live-cricket-scores/${matchId}/squads`);
		urlCandidates.push(`https://www.cricbuzz.com/cricket-scores/${matchId}/squads`);
		urlCandidates.push(`https://www.cricbuzz.com/cricket-scores/${matchId}`);
		urlCandidates.push(`https://www.cricbuzz.com/cricket-scores/${matchId}/scorecard`);
		urlCandidates.push(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`);
		urlCandidates.push(`https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`);
	}

	const { html: matchHtml } = await tryFetchFirstWorking([base], `cricbuzz_match_${matchId || 'page'}`);
	if (!matchHtml) return null;

	const $match = cheerio.load(matchHtml);
	const squadsHref = $match('a')
		.toArray()
		.map((el) => ({ href: el?.attribs?.href, text: normalizeWhitespace($match(el).text()) }))
		.find((a) => a?.href && /squads?/i.test(a.text || '') && String(a.href).includes(String(matchId || '')))?.href;
	const scorecardHref = $match('a')
		.toArray()
		.map((el) => ({ href: el?.attribs?.href, text: normalizeWhitespace($match(el).text()) }))
		.find((a) => a?.href && /scorecard/i.test(a.text || '') && String(a.href).includes(String(matchId || '')))?.href;
	if (squadsHref) urlCandidates.unshift(absoluteCricbuzzUrl(squadsHref));
	if (scorecardHref) urlCandidates.push(absoluteCricbuzzUrl(scorecardHref));

	const { url: fetchedUrl, html } = await tryFetchFirstWorking(uniqueStrings(urlCandidates), `cricbuzz_squads_${matchId || 'x'}`);
	if (!html) return null;

	const $ = cheerio.load(html);

	// Prefer structured team/player data from Next.js flight payload when available.
	const parsePairedTeamBundlesFromFlight = () => {
		const chunks = extractFlightStringsFromHtml(html);
		const marker1 = '"team1":';
		const marker2 = '"team2":';
		const objectMarker = '{"team1":';

		const TEAM_CODE_ALIASES_LITE = {
			csk: ['chennai super kings'],
			pbks: ['punjab kings', 'kings xi punjab'],
			kkr: ['kolkata knight riders'],
			srh: ['sunrisers hyderabad'],
			mi: ['mumbai indians'],
			rcb: ['royal challengers bengaluru', 'royal challengers bangalore'],
			dc: ['delhi capitals'],
			rr: ['rajasthan royals'],
			lsg: ['lucknow super giants'],
			gt: ['gujarat titans'],
			ind: ['india'],
			aus: ['australia'],
			nz: ['new zealand'],
			eng: ['england'],
			sa: ['south africa'],
			wi: ['west indies'],
			afg: ['afghanistan'],
			pak: ['pakistan'],
			sl: ['sri lanka'],
			ban: ['bangladesh'],
		};

		const normalizeLite = (value) =>
			String(value || '')
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();

		const getAliasVariants = (value) => {
			const raw = normalizeLite(value);
			if (!raw) return [];

			const out = new Set([raw]);
			const tokens = raw.split(' ').filter(Boolean);
			if (tokens.length > 1) {
				out.add(tokens.join(''));
				const initials = tokens.map((t) => t[0]).join('');
				if (initials.length >= 2) out.add(initials);
			}

			const compact = raw.replace(/\s+/g, '');
			const mapped = TEAM_CODE_ALIASES_LITE[compact];
			if (Array.isArray(mapped)) {
				for (const alias of mapped) {
					const normalized = normalizeLite(alias);
					if (!normalized) continue;
					out.add(normalized);
					const aliasTokens = normalized.split(' ').filter(Boolean);
					if (aliasTokens.length > 1) {
						out.add(aliasTokens.join(''));
						const initials = aliasTokens.map((t) => t[0]).join('');
						if (initials.length >= 2) out.add(initials);
					}
				}
			}

			return [...out].filter(Boolean);
		};

		const scoreLite = (expected, actual) => {
			const expectedVariants = getAliasVariants(expected);
			const actualVariants = getAliasVariants(actual);
			if (expectedVariants.length === 0 || actualVariants.length === 0) return 0;

			let best = 0;
			for (const e of expectedVariants) {
				for (const a of actualVariants) {
					if (!e || !a) continue;
					if (e === a) {
						best = Math.max(best, 100);
						continue;
					}
					if (e.includes(a) || a.includes(e)) {
						best = Math.max(best, 72);
						continue;
					}

					const eTokens = e.split(' ').filter(Boolean);
					const aTokens = new Set(a.split(' ').filter(Boolean));
					let overlap = 0;
					for (const tk of eTokens) {
						if (aTokens.has(tk)) overlap += 1;
					}
					if (overlap >= 1) best = Math.max(best, 56);
				}
			}

			return best;
		};

		const isBundle = (parsed) =>
			Boolean(
				parsed &&
				typeof parsed === 'object' &&
				parsed.team &&
				parsed.players &&
				typeof parsed.players === 'object',
			);

		const countPlayers = (bundle) =>
			Object.values(bundle?.players || {}).reduce(
				(sum, group) => sum + (Array.isArray(group) ? group.length : 0),
				0,
			);

		const hasPlayingXI = (bundle) =>
			Object.entries(bundle?.players || {}).some(
				([label, group]) => /playing\s*xi/i.test(String(label || '')) && Array.isArray(group) && group.length >= 8,
			);

		const addCandidate = (rawTeam1, rawTeam2, candidates) => {
			if (!isBundle(rawTeam1) || !isBundle(rawTeam2)) return;

			const t1Name = rawTeam1?.team?.teamName || rawTeam1?.team?.teamSName || '';
			const t2Name = rawTeam2?.team?.teamName || rawTeam2?.team?.teamSName || '';
			const normalScore = scoreLite(team1Name, t1Name) + scoreLite(team2Name, t2Name);
			const swappedScore = scoreLite(team1Name, t2Name) + scoreLite(team2Name, t1Name);
			const isSwapped = swappedScore > normalScore;

			const team1Bundle = isSwapped ? rawTeam2 : rawTeam1;
			const team2Bundle = isSwapped ? rawTeam1 : rawTeam2;
			const score = Math.max(normalScore, swappedScore);
			const playerCount = countPlayers(team1Bundle) + countPlayers(team2Bundle);
			const xiCount = (hasPlayingXI(team1Bundle) ? 1 : 0) + (hasPlayingXI(team2Bundle) ? 1 : 0);

			candidates.push({
				team1Bundle,
				team2Bundle,
				score,
				playerCount,
				xiCount,
			});
		};

		const candidates = [];
		for (const str of chunks) {
			const text = String(str || '');

			let objectFrom = 0;
			while (objectFrom < text.length) {
				const idx = text.indexOf(objectMarker, objectFrom);
				if (idx === -1) break;

				const objectJson = sliceBalancedJsonFromText(text, idx);
				if (!objectJson) {
					objectFrom = idx + objectMarker.length;
					continue;
				}

				try {
					const parsed = JSON.parse(objectJson);
					addCandidate(parsed?.team1, parsed?.team2, candidates);
				} catch {
					// ignore malformed candidate
				}

				objectFrom = idx + objectMarker.length;
			}

			let searchFrom = 0;
			while (searchFrom < text.length) {
				const idx1 = text.indexOf(marker1, searchFrom);
				if (idx1 === -1) break;

				const idx2 = text.indexOf(marker2, idx1 + marker1.length);
				if (idx2 === -1) {
					searchFrom = idx1 + marker1.length;
					continue;
				}

				const team1Json = sliceBalancedJsonFromText(text, idx1 + marker1.length);
				const team2Json = sliceBalancedJsonFromText(text, idx2 + marker2.length);
				if (!team1Json || !team2Json) {
					searchFrom = idx2 + marker2.length;
					continue;
				}

				try {
					const t1 = JSON.parse(team1Json);
					const t2 = JSON.parse(team2Json);
					if (!isBundle(t1) || !isBundle(t2)) {
						searchFrom = idx2 + marker2.length;
						continue;
					}

					addCandidate(t1, t2, candidates);
				} catch {
					// ignore malformed candidate
				}

				searchFrom = idx2 + marker2.length;
			}
		}

		if (candidates.length === 0) return { team1Bundle: null, team2Bundle: null };

		candidates.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (b.xiCount !== a.xiCount) return b.xiCount - a.xiCount;
			return b.playerCount - a.playerCount;
		});

		return {
			team1Bundle: candidates[0].team1Bundle,
			team2Bundle: candidates[0].team2Bundle,
		};
	};

	const { team1Bundle, team2Bundle } = parsePairedTeamBundlesFromFlight();
	if (team1Bundle && team2Bundle) {
		const team1Id = Number(team1Bundle?.team?.teamId || 0);
		const team2Id = Number(team2Bundle?.team?.teamId || 0);
		const team1Title = normalizeWhitespace(team1Bundle?.team?.teamName || team1Bundle?.team?.teamSName || team1Name || '') || '';
		const team2Title = normalizeWhitespace(team2Bundle?.team?.teamName || team2Bundle?.team?.teamSName || team2Name || '') || '';

		const sideByMeta = (player, fallbackSide) => {
			const pid = Number(player?.teamId || player?.team?.teamId || 0);
			if (pid && team1Id && pid === team1Id) return 'team1';
			if (pid && team2Id && pid === team2Id) return 'team2';

			const pTeamName = normalizeWhitespace(
				player?.teamName ||
				player?.teamSName ||
				player?.team?.teamName ||
				player?.team?.teamSName ||
				'',
			);
			if (pTeamName) {
				const s1 = scoreTeamText(team1Title, pTeamName);
				const s2 = scoreTeamText(team2Title, pTeamName);
				if (s1 >= 55 && s1 >= s2 + 5) return 'team1';
				if (s2 >= 55 && s2 >= s1 + 5) return 'team2';
			}

			return fallbackSide;
		};

		const extractName = (player) => player?.name || player?.fullName || player?.nickName || '';
		const pushPlayer = (sides, side, player) => {
			const name = extractName(player);
			if (!name) return;
			if (side === 'team1') sides.team1.push(name);
			if (side === 'team2') sides.team2.push(name);
		};

		const sides = {
			squad: { team1: [], team2: [] },
			xi: { team1: [], team2: [] },
		};

		const collectFromBundle = (bundle, fallbackSide) => {
			for (const [groupName, group] of Object.entries(bundle?.players || {})) {
				if (isSupportStaffGroupLabel(groupName)) continue;
				const list = Array.isArray(group) ? group : [];
				const isXIGroup = /playing\s*xi/i.test(String(groupName || ''));
				for (const player of list) {
					if (isSupportStaffRole(player?.role || player?.designation || player?.title || '')) continue;
					const side = sideByMeta(player, fallbackSide);
					pushPlayer(sides.squad, side, player);
					if (isXIGroup) pushPlayer(sides.xi, side, player);
				}
			}
		};

		collectFromBundle(team1Bundle, 'team1');
		collectFromBundle(team2Bundle, 'team2');

		let team1Squad = uniquePlayers(sides.squad.team1);
		let team2Squad = uniquePlayers(sides.squad.team2);
		let team1XI = uniquePlayers(sides.xi.team1);
		let team2XI = uniquePlayers(sides.xi.team2);

		if (team1Squad.length === 0 || team2Squad.length === 0) {
			const extractAllPlayers = (playersObj) =>
				uniquePlayers(
					Object.entries(playersObj || {}).flatMap(([groupName, group]) => {
						if (isSupportStaffGroupLabel(groupName)) return [];
						return (Array.isArray(group) ? group : [])
							.filter((player) => !isSupportStaffRole(player?.role || player?.designation || player?.title || ''))
							.map(extractName);
					}),
				);

			if (team1Squad.length === 0) team1Squad = extractAllPlayers(team1Bundle?.players);
			if (team2Squad.length === 0) team2Squad = extractAllPlayers(team2Bundle?.players);
		}

		if (team1XI.length === 0 || team2XI.length === 0) {
			const extractGroupPlayers = (group) =>
				uniquePlayers(
					(Array.isArray(group) ? group : []).map(extractName),
				);

			if (team1XI.length === 0) {
				team1XI = extractGroupPlayers(
					team1Bundle?.players?.['playing XI'] ||
					team1Bundle?.players?.playingXI ||
					team1Bundle?.players?.['Playing XI'] ||
					[],
				);
			}
			if (team2XI.length === 0) {
				team2XI = extractGroupPlayers(
					team2Bundle?.players?.['playing XI'] ||
					team2Bundle?.players?.playingXI ||
					team2Bundle?.players?.['Playing XI'] ||
					[],
				);
			}
		}

		let isPlayingXIDeclared = preferSquadOnly ? false : (team1XI.length >= 8 && team2XI.length >= 8);

		// For completed matches, prefer scorecard-derived participants so IPL Impact Player
		// substitutions are reflected (often 12 players involved for a side).
		if (!preferSquadOnly && matchId) {
			const scorecard = await scrapeCricbuzzScorecardPlayerStats(matchId).catch(() => null);
			const scorecardNames = scorecard?.playerNameById && typeof scorecard.playerNameById === 'object'
				? scorecard.playerNameById
				: {};
			const scorecardTeams = scorecard?.playerTeamById && typeof scorecard.playerTeamById === 'object'
				? scorecard.playerTeamById
				: {};

			const headerTeam1Id = Number(scorecard?.matchHeader?.team1?.id || 0);
			const headerTeam2Id = Number(scorecard?.matchHeader?.team2?.id || 0);

			const normalizeLite = (value) =>
				normalizeWhitespace(value)
					.toLowerCase()
					.replace(/[^a-z0-9\s]/g, ' ')
					.replace(/\s+/g, ' ')
					.trim();

			const matchesAny = (target, candidates) =>
				candidates.some((c) => c && (target === c || target.includes(c) || c.includes(target)));

			const team1Refs = uniqueStrings([
				team1Title,
				team1Name,
				team1Bundle?.team?.teamSName,
				team1Bundle?.team?.teamName,
			]).map(normalizeLite).filter(Boolean);
			const team2Refs = uniqueStrings([
				team2Title,
				team2Name,
				team2Bundle?.team?.teamSName,
				team2Bundle?.team?.teamName,
			]).map(normalizeLite).filter(Boolean);

			const resolveScorecardSide = (teamInfo) => {
				if (!teamInfo || typeof teamInfo !== 'object') return null;

				const teamId = Number(teamInfo?.teamId || 0);
				if (teamId && headerTeam1Id && teamId === headerTeam1Id) return 'team1';
				if (teamId && headerTeam2Id && teamId === headerTeam2Id) return 'team2';

				const teamText = normalizeLite(`${teamInfo?.teamName || ''} ${teamInfo?.teamShortName || ''}`);
				if (!teamText) return null;

				const isTeam1 = matchesAny(teamText, team1Refs);
				const isTeam2 = matchesAny(teamText, team2Refs);
				if (isTeam1 && !isTeam2) return 'team1';
				if (isTeam2 && !isTeam1) return 'team2';
				return null;
			};

			const scorecardTeam1Players = uniquePlayers(
				Object.entries(scorecardNames)
					.filter(([pid]) => resolveScorecardSide(scorecardTeams?.[pid]) === 'team1')
					.map(([, rawName]) => rawName),
			);
			const scorecardTeam2Players = uniquePlayers(
				Object.entries(scorecardNames)
					.filter(([pid]) => resolveScorecardSide(scorecardTeams?.[pid]) === 'team2')
					.map(([, rawName]) => rawName),
			);

			if (scorecardTeam1Players.length >= 11 && scorecardTeam2Players.length >= 11) {
				team1XI = scorecardTeam1Players;
				team2XI = scorecardTeam2Players;
				team1Squad = uniquePlayers([...team1Squad, ...scorecardTeam1Players]);
				team2Squad = uniquePlayers([...team2Squad, ...scorecardTeam2Players]);
				isPlayingXIDeclared = true;
			}
		}

		const players = uniquePlayers([...team1Squad, ...team2Squad]);
		const playingXI = uniquePlayers([...team1XI, ...team2XI]);

		return {
			matchId: matchId || null,
			matchUrl,
			sourceUrl: fetchedUrl,
			teamNames: {
				team1: normalizeWhitespace(team1Bundle?.team?.teamName || team1Bundle?.team?.teamSName || '') || team1Name || null,
				team2: normalizeWhitespace(team2Bundle?.team?.teamName || team2Bundle?.team?.teamSName || '') || team2Name || null,
			},
			squad: {
				team1: team1Squad,
				team2: team2Squad,
			},
			playingXIByTeam: {
				team1: team1XI,
				team2: team2XI,
			},
			players,
			playingXI,
			isPlayingXIDeclared,
		};
	}

	// Attempt 1: parse explicit "Playing XI" blocks in visible text
	const textBlobs = uniqueStrings(
		$('body')
			.clone()
			.find('script,style,noscript')
			.remove()
			.end()
			.text()
			.split(/\r?\n/)
			.map((l) => normalizeWhitespace(l))
			.filter(Boolean),
	);

	let isPlayingXIDeclared = false;
	const playingXIStatus = textBlobs.find((line) =>
		/playing\s*xi|xi\s*declared|xi\s*not\s*yet\s*declared/i.test(line),
	);
	if (playingXIStatus) {
		isPlayingXIDeclared = !/not\s*yet\s*declared|not\s*declared|tbd|to\s*be\s*announced/i.test(playingXIStatus);
	}

	// If we couldn't find team-separated playing XI, get all and fallback
	const allPlayingXI = [];
	for (const line of textBlobs) {
		if (!/playing\s*xi/i.test(line)) continue;
		const after = line.split(/playing\s*xi\s*[:\-]/i)[1];
		if (!after) continue;
		const players = splitPlayersList(after);
		if (players.length >= 8) {
			allPlayingXI.push(...players);
		}
	}

	const normalizeTeamLabel = (value) =>
		normalizeWhitespace(value)
			.toLowerCase()
			.replace(/\b(team|squad|players?|playing|xi|lineup|line\s*up)\b/g, ' ')
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const TEAM_CODE_ALIASES = {
		csk: ['chennai super kings'],
		pbks: ['punjab kings', 'kings xi punjab'],
		kkr: ['kolkata knight riders'],
		srh: ['sunrisers hyderabad'],
		mi: ['mumbai indians'],
		rcb: ['royal challengers bengaluru', 'royal challengers bangalore'],
		dc: ['delhi capitals'],
		rr: ['rajasthan royals'],
		lsg: ['lucknow super giants'],
		gt: ['gujarat titans'],
		ind: ['india'],
		aus: ['australia'],
		nz: ['new zealand'],
		eng: ['england'],
		sa: ['south africa'],
		wi: ['west indies'],
		afg: ['afghanistan'],
		pak: ['pakistan'],
		sl: ['sri lanka'],
		ban: ['bangladesh'],
	};

	const getTeamAliases = (value) => {
		const raw = normalizeWhitespace(value);
		if (!raw) return [];

		const out = new Set();
		const normalized = normalizeTeamLabel(raw);
		if (normalized) out.add(normalized);

		const tokens = normalized.split(' ').filter(Boolean);
		if (tokens.length > 1) {
			const initials = tokens.map((t) => t[0]).join('');
			if (initials.length >= 2) out.add(initials);
			out.add(tokens.join(''));
		}

		const compact = normalizeWhitespace(raw)
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (compact) out.add(compact);

		const compactToken = compact.replace(/\s+/g, '');
		const mapped = TEAM_CODE_ALIASES[compactToken];
		if (Array.isArray(mapped)) {
			for (const alias of mapped) {
				const normalizedAlias = normalizeTeamLabel(alias);
				if (normalizedAlias) out.add(normalizedAlias);
			}
		}

		return [...out].filter(Boolean);
	};

	const scoreTeamText = (teamName, text) => {
		if (!teamName || !text) return 0;
		const target = normalizeTeamLabel(text);
		if (!target) return 0;

		const aliases = getTeamAliases(teamName);
		let score = 0;

		for (const alias of aliases) {
			if (!alias) continue;
			if (target === alias) {
				score = Math.max(score, 100);
				continue;
			}
			if (target.includes(alias) || alias.includes(target)) {
				score = Math.max(score, 72);
				continue;
			}

			const aliasTokens = alias.split(' ').filter(Boolean);
			const targetTokens = new Set(target.split(' ').filter(Boolean));
			let overlap = 0;
			for (const tk of aliasTokens) {
				if (targetTokens.has(tk)) overlap += 1;
			}
			if (overlap >= Math.max(1, Math.min(2, aliasTokens.length))) {
				score = Math.max(score, 58);
			}
		}

		if (/\b(squad|playing\s*xi|lineup|players?)\b/i.test(text)) score += 12;
		return score;
	};

	let scorecardSideByPlayerKey = new Map();
	let scorecardOwnedTeam1Players = [];
	let scorecardOwnedTeam2Players = [];
	if (matchId) {
		const scorecard = await scrapeCricbuzzScorecardPlayerStats(matchId).catch(() => null);
		const scorecardNames = scorecard?.playerNameById && typeof scorecard.playerNameById === 'object'
			? scorecard.playerNameById
			: {};
		const scorecardTeams = scorecard?.playerTeamById && typeof scorecard.playerTeamById === 'object'
			? scorecard.playerTeamById
			: {};

		const matchHeader = scorecard?.matchHeader || {};
		const headerTeam1 = matchHeader?.team1 || {};
		const headerTeam2 = matchHeader?.team2 || {};
		const headerTeam1Id = Number(headerTeam1?.id || 0);
		const headerTeam2Id = Number(headerTeam2?.id || 0);

		const team1Candidates = uniqueStrings([
			team1Name,
			headerTeam1?.name,
			headerTeam1?.shortName,
		]);
		const team2Candidates = uniqueStrings([
			team2Name,
			headerTeam2?.name,
			headerTeam2?.shortName,
		]);

		const scoreLocalSideForHeaderTeam = (headerTeam) => {
			const headerText = uniqueStrings([headerTeam?.name, headerTeam?.shortName]).join(' ');
			if (!headerText) return null;

			let s1 = 0;
			for (const candidate of team1Candidates) {
				s1 = Math.max(s1, scoreTeamText(candidate, headerText));
			}

			let s2 = 0;
			for (const candidate of team2Candidates) {
				s2 = Math.max(s2, scoreTeamText(candidate, headerText));
			}

			if (s1 >= 55 && s1 >= s2 + 5) return 'team1';
			if (s2 >= 55 && s2 >= s1 + 5) return 'team2';
			return null;
		};

		let headerTeam1LocalSide = scoreLocalSideForHeaderTeam(headerTeam1);
		let headerTeam2LocalSide = scoreLocalSideForHeaderTeam(headerTeam2);

		if (!headerTeam1LocalSide && headerTeam2LocalSide) {
			headerTeam1LocalSide = headerTeam2LocalSide === 'team1' ? 'team2' : 'team1';
		}
		if (!headerTeam2LocalSide && headerTeam1LocalSide) {
			headerTeam2LocalSide = headerTeam1LocalSide === 'team1' ? 'team2' : 'team1';
		}

		if (!headerTeam1LocalSide) headerTeam1LocalSide = 'team1';
		if (!headerTeam2LocalSide) headerTeam2LocalSide = headerTeam1LocalSide === 'team1' ? 'team2' : 'team1';

		const headerTeam1Label = normalizeWhitespace(headerTeam1?.name || headerTeam1?.shortName || '') || null;
		const headerTeam2Label = normalizeWhitespace(headerTeam2?.name || headerTeam2?.shortName || '') || null;
		if (headerTeam1Label) {
			if (headerTeam1LocalSide === 'team1') resolvedTeam1Label = headerTeam1Label;
			if (headerTeam1LocalSide === 'team2') resolvedTeam2Label = headerTeam1Label;
		}
		if (headerTeam2Label) {
			if (headerTeam2LocalSide === 'team1') resolvedTeam1Label = headerTeam2Label;
			if (headerTeam2LocalSide === 'team2') resolvedTeam2Label = headerTeam2Label;
		}

		const resolveScorecardSide = (teamInfo) => {
			if (!teamInfo || typeof teamInfo !== 'object') return null;

			const teamId = Number(teamInfo?.teamId || 0);
			if (teamId && headerTeam1Id && teamId === headerTeam1Id) return headerTeam1LocalSide;
			if (teamId && headerTeam2Id && teamId === headerTeam2Id) return headerTeam2LocalSide;

			const teamText = uniqueStrings([teamInfo?.teamName, teamInfo?.teamShortName]).join(' ');
			if (!teamText) return null;

			let s1 = 0;
			for (const candidate of team1Candidates) {
				s1 = Math.max(s1, scoreTeamText(candidate, teamText));
			}

			let s2 = 0;
			for (const candidate of team2Candidates) {
				s2 = Math.max(s2, scoreTeamText(candidate, teamText));
			}

			if (s1 >= 55 && s1 >= s2 + 5) return 'team1';
			if (s2 >= 55 && s2 >= s1 + 5) return 'team2';
			return null;
		};

		const mapped = new Map();
		for (const [pid, rawName] of Object.entries(scorecardNames)) {
			const side = resolveScorecardSide(scorecardTeams?.[pid]);
			if (!side) continue;

			const key = normalizePlayerKey(rawName);
			if (!key) continue;
			mapped.set(key, side);
		}

		scorecardSideByPlayerKey = mapped;
		scorecardOwnedTeam1Players = uniquePlayers(
			Object.entries(scorecardNames)
				.filter(([pid]) => resolveScorecardSide(scorecardTeams?.[pid]) === 'team1')
				.map(([, rawName]) => rawName),
		);
		scorecardOwnedTeam2Players = uniquePlayers(
			Object.entries(scorecardNames)
				.filter(([pid]) => resolveScorecardSide(scorecardTeams?.[pid]) === 'team2')
				.map(([, rawName]) => rawName),
		);
	}

	const getScorecardSide = (playerName) => scorecardSideByPlayerKey.get(normalizePlayerKey(playerName)) || null;

	const isTeamText = (teamName, text) => scoreTeamText(teamName, text) >= 55;

	const collectContextTextsForLink = ($el) => {
		const contexts = [];
		const pushContext = (value) => {
			const t = normalizeWhitespace(value);
			if (!t) return;
			contexts.push(t.slice(0, 320));
		};

		pushContext($el.text());

		for (const sel of ['li', 'tr', 'p', 'td', 'th', 'div', 'section', 'article']) {
			const $ctx = $el.closest(sel).first();
			if ($ctx?.length) pushContext($ctx.text());
		}

		let $parent = $el.parent();
		let depth = 0;
		while ($parent && $parent.length && depth < 4) {
			pushContext($parent.text());
			$parent = $parent.parent();
			depth += 1;
		}

		let $node = $el;
		let hops = 0;
		while ($node && $node.length && hops < 4) {
			const $prevLabel = $node.prevAll('h1,h2,h3,h4,h5,strong,b,label,th,td,span,div,p').first();
			if ($prevLabel?.length) pushContext($prevLabel.text());
			$node = $node.parent();
			hops += 1;
		}

		return uniqueStrings(contexts);
	};

	const getProfileEntry = ($el) => {
		const rawName = normalizeWhitespace($el.text());
		if (!rawName) return null;

		const contexts = collectContextTextsForLink($el);
		if (contexts.some((ctx) => isLikelyStaffContext(ctx))) return null;

		const cleanedName = sanitizePlayerName(rawName);
		if (!cleanedName) return null;

		return { name: cleanedName, contexts };
	};

	const profileEntries = $('a[href*="/profiles/"]')
		.toArray()
		.map((el) => getProfileEntry($(el)))
		.filter(Boolean);

	const profilePlayers = uniquePlayers(profileEntries.map((entry) => entry.name));

	const profilePlayersByTeam = (() => {
		const team1 = [];
		const team2 = [];
		for (const entry of profileEntries) {
			const joinedContext = entry.contexts.join(' ');
			const s1 = scoreTeamText(team1Name, joinedContext);
			const s2 = scoreTeamText(team2Name, joinedContext);

			if (s1 >= 55 && s1 >= s2 + 8) {
				team1.push(entry.name);
				continue;
			}
			if (s2 >= 55 && s2 >= s1 + 8) {
				team2.push(entry.name);
			}
		}

		return {
			team1: uniquePlayers(team1),
			team2: uniquePlayers(team2),
		};
	})();

	const allPlayers = uniquePlayers([...(allPlayingXI.length ? allPlayingXI : []), ...profilePlayers]);

	const looksLikeTeamHeader = (text) => {
		const t = normalizeWhitespace(text);
		if (!t) return false;
		if (team1Name && isTeamText(team1Name, t)) return true;
		if (team2Name && isTeamText(team2Name, t)) return true;
		return false;
	};

	const findTeamHeaderEl = (name) => {
		if (!name) return null;

		let best = null;
		$('h1,h2,h3,h4,h5,strong,b,th,td,div,span,p').each((_, el) => {
			const text = normalizeWhitespace($(el).text());
			if (!text || text.length > 120) return;
			if (isLikelyStaffContext(text)) return;

			const score = scoreTeamText(name, text);
			if (score < 55) return;

			if (!best || score > best.score) {
				best = { el, score };
			}
		});

		return best?.el || null;
	};

	const extractProfileNamesFromNode = ($node) =>
		uniquePlayers(
			$node
				.find('a[href*="/profiles/"]')
				.toArray()
				.map((el) => {
					const entry = getProfileEntry($(el));
					return entry?.name || '';
				}),
		);

	const collectPlayersAfterHeader = (headerEl) => {
		if (!headerEl) return [];

		const $header = $(headerEl);
		if (!$header?.length) return [];

		const players = [];
		let $sib = $header.next();
		let guard = 0;
		while ($sib && $sib.length && guard < 200) {
			guard += 1;
			const t = normalizeWhitespace($sib.text());
			if (looksLikeTeamHeader(t)) break;
			if (isLikelyStaffContext(t)) break;
			players.push(...extractProfileNamesFromNode($sib));
			$sib = $sib.next();
		}
		return uniquePlayers(players);
	};

	const collectTeamPlayersFromText = (teamName, mode = 'squad') => {
		if (!teamName) return [];

		const out = [];
		for (const line of textBlobs) {
			const t = normalizeWhitespace(line);
			if (!t) continue;
			if (!isTeamText(teamName, t)) continue;
			if (isLikelyStaffContext(t)) continue;

			let payload = '';
			if (mode === 'xi') {
				payload = t.split(/playing\s*xi\s*[:\-]/i)[1] || t.split(/\bxi\b\s*[:\-]/i)[1] || '';
			} else {
				payload =
					t.split(/squad\s*[:\-]/i)[1] ||
					t.split(/players?\s*[:\-]/i)[1] ||
					t.split(/playing\s*xi\s*[:\-]/i)[1] ||
					'';
			}

			if (!payload) continue;
			const players = splitPlayersList(payload);
			if (players.length >= 2) out.push(...players);
		}

		return uniquePlayers(out);
	};

	// Team-separated squad players (no mixing)
	const team1HeaderEl = findTeamHeaderEl(team1Name);
	const team2HeaderEl = findTeamHeaderEl(team2Name);
	let team1SquadPlayers = uniquePlayers([
		...collectPlayersAfterHeader(team1HeaderEl),
		...profilePlayersByTeam.team1,
		...collectTeamPlayersFromText(team1Name, 'squad'),
	]);
	let team2SquadPlayers = uniquePlayers([
		...collectPlayersAfterHeader(team2HeaderEl),
		...profilePlayersByTeam.team2,
		...collectTeamPlayersFromText(team2Name, 'squad'),
	]);

	const hasStrongScorecardTeams =
		scorecardOwnedTeam1Players.length >= 8 && scorecardOwnedTeam2Players.length >= 8;

	if (!preferSquadOnly && hasStrongScorecardTeams) {
		team1SquadPlayers = scorecardOwnedTeam1Players;
		team2SquadPlayers = scorecardOwnedTeam2Players;
	}

	const scorecardTeam1Players = uniquePlayers(allPlayers.filter((p) => getScorecardSide(p) === 'team1'));
	const scorecardTeam2Players = uniquePlayers(allPlayers.filter((p) => getScorecardSide(p) === 'team2'));
	const hasScorecardSplit = scorecardTeam1Players.length > 0 && scorecardTeam2Players.length > 0;

	if (!preferSquadOnly && hasScorecardSplit) {
		const team1Misassigned = team1SquadPlayers.filter((p) => getScorecardSide(p) === 'team2').length;
		const team2Misassigned = team2SquadPlayers.filter((p) => getScorecardSide(p) === 'team1').length;

		if (
			team1SquadPlayers.length === 0 ||
			team2SquadPlayers.length === 0 ||
			team1Misassigned > 0 ||
			team2Misassigned > 0
		) {
			team1SquadPlayers = scorecardTeam1Players;
			team2SquadPlayers = scorecardTeam2Players;
		} else {
			team1SquadPlayers = uniquePlayers([
				...team1SquadPlayers.filter((p) => getScorecardSide(p) !== 'team2'),
				...scorecardTeam1Players,
			]);
			team2SquadPlayers = uniquePlayers([
				...team2SquadPlayers.filter((p) => getScorecardSide(p) !== 'team1'),
				...scorecardTeam2Players,
			]);
		}
	}

	if (team1SquadPlayers.length === 0 && team2SquadPlayers.length === 0 && allPlayers.length >= 2) {
		const mid = Math.ceil(allPlayers.length / 2);
		team1SquadPlayers = uniquePlayers(allPlayers.slice(0, mid));
		team2SquadPlayers = uniquePlayers(allPlayers.slice(mid));
	}

	const playingXIKeys = new Set(uniquePlayers(allPlayingXI).map((p) => normalizePlayerKey(p)));
	let team1XIPlayers = uniquePlayers([
		...collectTeamPlayersFromText(team1Name, 'xi'),
		...team1SquadPlayers.filter((p) => playingXIKeys.has(normalizePlayerKey(p))),
	]);
	let team2XIPlayers = uniquePlayers([
		...collectTeamPlayersFromText(team2Name, 'xi'),
		...team2SquadPlayers.filter((p) => playingXIKeys.has(normalizePlayerKey(p))),
	]);

	if (!preferSquadOnly && hasStrongScorecardTeams) {
		team1XIPlayers = scorecardOwnedTeam1Players;
		team2XIPlayers = scorecardOwnedTeam2Players;
		isPlayingXIDeclared = true;
	}

	const scorecardTeam1XIPlayers = uniquePlayers(allPlayingXI.filter((p) => getScorecardSide(p) === 'team1'));
	const scorecardTeam2XIPlayers = uniquePlayers(allPlayingXI.filter((p) => getScorecardSide(p) === 'team2'));
	if (!preferSquadOnly && scorecardTeam1XIPlayers.length > 0 && scorecardTeam2XIPlayers.length > 0) {
		team1XIPlayers = uniquePlayers([
			...team1XIPlayers.filter((p) => getScorecardSide(p) !== 'team2'),
			...scorecardTeam1XIPlayers,
		]);
		team2XIPlayers = uniquePlayers([
			...team2XIPlayers.filter((p) => getScorecardSide(p) !== 'team1'),
			...scorecardTeam2XIPlayers,
		]);
		isPlayingXIDeclared = true;
	}

	if (team1XIPlayers.length === 0 && team2XIPlayers.length === 0 && allPlayingXI.length >= 2) {
		const xiMid = Math.ceil(allPlayingXI.length / 2);
		team1XIPlayers = uniquePlayers(allPlayingXI.slice(0, xiMid));
		team2XIPlayers = uniquePlayers(allPlayingXI.slice(xiMid));
	}

	if (preferSquadOnly) {
		isPlayingXIDeclared = false;
	}

	return {
		matchId: matchId || null,
		matchUrl,
		sourceUrl: fetchedUrl,
		teamNames: {
			team1: resolvedTeam1Label || null,
			team2: resolvedTeam2Label || null,
		},
		squad: {
			team1: team1SquadPlayers,
			team2: team2SquadPlayers,
		},
		playingXIByTeam: {
			team1: team1XIPlayers,
			team2: team2XIPlayers,
		},
		players: uniquePlayers(allPlayers),
		playingXI: uniquePlayers(allPlayingXI.length > 0 ? allPlayingXI : allPlayers),
		isPlayingXIDeclared,
	};
};

const extractLines = ($el) => {
	const text = $el
		.clone()
		.find('script,style,noscript')
		.remove()
		.end()
		.text();
	const lines = String(text)
		.split(/\r?\n/)
		.map((l) => normalizeWhitespace(l))
		.filter(Boolean);
	// de-dupe consecutive duplicates
	return lines.filter((line, idx) => idx === 0 || line !== lines[idx - 1]);
};

const isLikelyTeamName = (line) => {
	if (!line) return false;
	if (line.length < 2 || line.length > 40) return false;
	if (!/[A-Za-z]/.test(line)) return false;
	if (/\b(LIVE|TODAY|RESULT|SCORECARD|PREVIEW)\b/i.test(line)) return false;
	if (/match starts|starts in|scheduled|today,|tomorrow,|mins|\bov\b|\d+\/?\d*/i.test(line)) return false;
	if (/see all/i.test(line)) return false;
	return true;
};

const isMatchHref = (href) => {
	if (!href) return false;
	// Match pages usually contain a numeric id in the path
	return /\/(live-)?cricket-scores\/\d+\//i.test(href);
};

const pickCardContainer = ($a) => {
	// Walk up until we find a container that appears to represent a single match card.
	let current = $a;
	for (let i = 0; i < 6; i += 1) {
		const parent = current.parent();
		if (!parent || parent.length === 0) break;

		const text = normalizeWhitespace(parent.text());
		const matchLinkCount = parent
			.find('a[href*="/live-cricket-scores/"], a[href*="/cricket-scores/"]')
			.toArray()
			.map((el) => el?.attribs?.href)
			.filter((href) => isMatchHref(href)).length;

		if (text.length > 0 && text.length <= 600 && matchLinkCount === 1) {
			return parent;
		}

		current = parent;
	}
	return null;
};

const toTitleFromSlug = (value) => {
	const out = normalizeWhitespace(String(value || '').replace(/[-_]+/g, ' '));
	if (!out) return null;
	return out
		.split(' ')
		.map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
		.join(' ');
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
	'dd',
	'deccan chargers',
	'pwi',
	'puni warriors india',
	'kochituskers kerala',
	'kochi tuskers kerala',
]);

const normalizeTeamToken = (value) =>
	normalizeWhitespace(value)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.trim();

const isLikelyIplTeam = (value) => {
	const token = normalizeTeamToken(value);
	if (!token) return false;
	if (IPL_TEAM_TOKENS.has(token)) return true;
	return false;
};

const isLikelyIplTeamsPair = (team1, team2) => isLikelyIplTeam(team1) && isLikelyIplTeam(team2);

const IPL_TEAM_SLUG_TO_NAME = new Map([
	['kkr', 'KKR'],
	['srh', 'SRH'],
	['mi', 'MI'],
	['csk', 'CSK'],
	['rcb', 'RCB'],
	['dc', 'DC'],
	['rr', 'RR'],
	['pbks', 'PBKS'],
	['kxip', 'KXIP'],
	['lsg', 'LSG'],
	['gt', 'GT'],
]);

const IPL_SLUG_STOP_TOKENS = new Set([
	'match',
	'final',
	'qualifier',
	'eliminator',
	'playoff',
	'playoffs',
	'indian',
	'premier',
	'league',
	'ipl',
	'season',
	'group',
	'stage',
	'super',
	'over',
	't20',
	't20i',
	'odi',
	'test',
]);

const toTeamNameFromSlug = (slug) => {
	const normalized = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
	if (!normalized) return null;
	if (IPL_TEAM_SLUG_TO_NAME.has(normalized)) return IPL_TEAM_SLUG_TO_NAME.get(normalized);
	return toTitleFromSlug(normalized);
};

const extractTeamsFromMatchUrlSlug = (matchUrl) => {
	const slug = String(matchUrl || '').match(/\/(?:live-cricket-scores|cricket-scores)\/\d+\/([^/?#]+)/i)?.[1] || '';
	if (!slug.includes('-vs-')) return { team1: null, team2: null };

	const [leftRaw, rightRaw] = slug.split('-vs-');
	if (!leftRaw || !rightRaw) return { team1: null, team2: null };

	const rightTokens = String(rightRaw)
		.toLowerCase()
		.split('-')
		.filter(Boolean);
	const team2Tokens = [];
	for (const token of rightTokens) {
		if (IPL_SLUG_STOP_TOKENS.has(token)) break;
		if (/^\d+(?:st|nd|rd|th)?$/.test(token)) break;
		team2Tokens.push(token);
	}

	const team1 = toTeamNameFromSlug(leftRaw);
	const team2 = toTeamNameFromSlug(team2Tokens.join('-'));
	return { team1, team2 };
};

const extractSeriesNameFromMatchUrl = (matchUrl) => {
	const u = String(matchUrl || '');
	if (!u) return null;

	const seriesSeg = u.match(/\/series\/([^/]+)\//i)?.[1];
	if (seriesSeg) return toTitleFromSlug(seriesSeg);

	const tailSeg = u.match(/\/(?:live-cricket-scores|cricket-scores)\/\d+\/([^/?#]+)/i)?.[1];
	if (!tailSeg) return null;

	const iplPart = String(tailSeg).match(/indian-premier-league(?:-[a-z0-9-]+)?/i)?.[0];
	if (iplPart) return toTitleFromSlug(iplPart);

	if (/\bipl\b/i.test(tailSeg)) return 'IPL';

	return null;
};

const deriveLeagueFromSeriesName = (seriesName) => {
	const s = String(seriesName || '').toLowerCase();
	if (/indian premier league|\bipl\b/.test(s) && !/women|women's|womens|\bwpl\b/.test(s)) {
		return 'IPL';
	}
	return null;
};

const parseMatchCard = ($a) => {
	const href = $a.attr('href') || '';
	const matchUrl = absoluteCricbuzzUrl(href);
	const rawText = normalizeWhitespace($a.text());

	// Try to include small surrounding card container (for LIVE / starts-in), but avoid multi-match containers.
	const $container = pickCardContainer($a);
	const contextText = $container ? normalizeWhitespace($container.text()) : rawText;
	const lines = extractLines($container || $a);

	let matchStatus = 'TODAY';
	if (
		lines.some((l) => /^LIVE$/i.test(l)) ||
		/\bLIVE\b/i.test(contextText) ||
		/opt to bat|stumps|innings|\b\d+\/\d+\b|\bov\b/i.test(contextText)
	) {
		matchStatus = 'LIVE';
	}

	const startTimeText =
		lines.find((l) =>
			/match starts|starts in|\btoday\b|\btomorrow\b|\d{1,2}:\d{2}|\b(am|pm)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
				l,
			),
		) || null;

	let team1 = null;
	let team2 = null;
	const vsLine = [rawText, ...lines].find((l) => /\s+vs\s+/i.test(l) || /\s+v\s+/i.test(l));
	if (vsLine) {
		const parts = vsLine.split(/\s+vs\s+|\s+v\s+/i);
		const cleanTeam = (value) => normalizeWhitespace(value).split(' - ')[0].split(' – ')[0].split(' — ')[0].trim();
		team1 = cleanTeam(parts[0]);
		team2 = cleanTeam(parts[1]);
	} else {
		const teamCandidates = lines.filter(isLikelyTeamName);
		if (teamCandidates.length >= 2) {
			team1 = teamCandidates[0];
			team2 = teamCandidates[1];
		}
	}

	let matchName =
		lines.find((l) => ![team1, team2].includes(l) && l !== 'LIVE' && l !== startTimeText && l.length > 2) || null;
	if (!matchName && team1 && team2) matchName = `${team1} vs ${team2}`;
	if (!matchName) matchName = rawText || null;

	const seriesName = extractSeriesNameFromMatchUrl(matchUrl);
	let league = deriveLeagueFromSeriesName(seriesName);
	if (!league && isLikelyIplTeamsPair(team1, team2)) {
		league = 'IPL';
	}

	return {
		matchUrl,
		matchName,
		team1,
		team2,
		seriesName: seriesName || (league === 'IPL' ? 'Indian Premier League' : null),
		league,
		matchStatus,
		startTimeText,
		contextText,
		rawText,
	};
};

/**
 * Parse match type from text
 */
const parseMatchType = (text) => {
	if (!text) return null;
	const t = String(text).toUpperCase();
	if (t.includes('TWENTY20')) return 'T20';
	if (t.includes('T20') || t.includes('T20I')) return 'T20';
	if (t.includes('T10')) return 'T20';
	if (t.includes('100 BALL') || t.includes('THE HUNDRED')) return 'T20';
	if (t.includes('LIST A')) return 'ODI';
	if (t.includes('ONE DAY') || t.includes('ONE-DAY') || t.includes('50 OVER') || t.includes('50-OVER')) return 'ODI';
	if (t.includes('ODI')) return 'ODI';
	if (t.includes('FIRST CLASS') || /\bFC\b/.test(t) || t.includes('4 DAY') || t.includes('5 DAY')) return 'TEST';
	if (t.includes('TEST')) return 'TEST';
	if (t.includes('INTERNATIONAL')) return 'ODI'; // Default assumption
	return null;
};

const extractFormatFromHtml = (html) => {
	if (!html) return null;
	const upper = String(html).toUpperCase();
	// Look for explicit JSON keys first (from scripts/embedded data)
	const jsonKeyMatch = upper.match(/"MATCHTYPE"\s*:\s*"(T20I?|ODI|TEST)"/i)
		|| upper.match(/"MATCHFORMAT"\s*:\s*"(T20I?|ODI|TEST)"/i)
		|| upper.match(/"FORMAT"\s*:\s*"(T20I?|ODI|TEST)"/i);
	if (jsonKeyMatch?.[1]) return parseMatchType(jsonKeyMatch[1]);

	// Look for labels in HTML text
	const labelMatch = upper.match(/MATCH\s*TYPE\s*[:\-]?\s*(T20I?|ODI|TEST)/i)
		|| upper.match(/FORMAT\s*[:\-]?\s*(T20I?|ODI|TEST)/i);
	if (labelMatch?.[1]) return parseMatchType(labelMatch[1]);

	// Fallback: find nearby phrases in title/meta/body
	const anyMatch = upper.match(/\b(T20I?|ODI|TEST)\b/);
	if (anyMatch?.[1]) return parseMatchType(anyMatch[1]);

	return null;
};

const scrapeMatchFormatFromCricbuzz = async (matchUrl) => {
	if (!matchUrl) return null;
	const url = absoluteCricbuzzUrl(matchUrl);
	const cached = getCachedMatchFormat(url);
	if (cached) return cached;

	const html = await fetchPage(url, 'cricbuzz_match_format');
	if (!html) return null;

	// Prefer extracting the format for THIS matchId (avoids false positives from other
	// matches/formats embedded in the same page).
	try {
		const idMatch = String(url).match(/\/live-cricket-scores\/(\d+)\//);
		const matchId = idMatch?.[1] ? String(idMatch[1]) : null;
		if (matchId) {
			const scan = String(html).replace(/\\"/g, '"');
			const re = new RegExp(`"matchId"\\s*:\\s*${matchId}[\\s\\S]{0,700}?"matchFormat"\\s*:\\s*"(T20I?|ODI|TEST)"`, 'i');
			const m = scan.match(re);
			if (m?.[1]) {
				const fmt = parseMatchType(m[1]);
				if (fmt) {
					setCachedMatchFormat(url, fmt);
					return fmt;
				}
			}
		}
	} catch {
		// ignore
	}

	const $ = cheerio.load(html);
	const titleText = normalizeWhitespace($('title').text());
	const metaDesc = normalizeWhitespace($('meta[name="description"]').attr('content'));
	const ogDesc = normalizeWhitespace($('meta[property="og:description"]').attr('content'));
	const labelText = normalizeWhitespace(
		$('*:contains("Match Type"), *:contains("Format"), *:contains("Match format")')
			.first()
			.parent()
			.text(),
	);
	const bodyText = normalizeWhitespace($('body').text());
	const combined = `${titleText} ${metaDesc} ${ogDesc} ${labelText} ${bodyText}`;
	const format = extractFormatFromHtml(html) || parseMatchType(combined);
	if (format) setCachedMatchFormat(url, format);
	return format;
};

const enrichMatchesWithFormat = async (matches, options = {}) => {
	const list = Array.isArray(matches) ? matches : [];
	const max = Number(options.max || 6);
	const delayMs = Number(options.delayMs || 200);
	let processed = 0;
	for (const match of list) {
		if (processed >= max) break;
		if (match?.matchType || !match?.matchUrl) continue;
		// Throttle a bit to avoid hammering
		await delay(delayMs);
		const format = await scrapeMatchFormatFromCricbuzz(match.matchUrl);
		if (format) match.matchType = format;
		processed += 1;
	}
	return list;
};

/**
 * Parse match status
 */
const parseMatchStatus = (text) => {
	if (!text) return 'UPCOMING';
	const s = String(text).toLowerCase();
	if (s.includes('live') || s.includes('ongoing') || s.includes('in progress')) return 'LIVE';
	if (s.includes('today') || s.includes('scheduled')) return 'TODAY';
	if (s.includes('completed') || s.includes('finished') || s.includes('result')) return 'COMPLETED';
	return 'UPCOMING';
};

/**
 * Extract team names from match string
 * Example: "India vs Australia" -> {team1, team2}
 */
const parseTeams = (matchString) => {
	if (!matchString) return { team1: null, team2: null };
	
	const parts = String(matchString).split(/\s+vs\s+|\s+v\/s\s+|\s+v\s+/i);
	if (parts.length >= 2) {
		return {
			team1: parts[0].trim(),
			team2: parts[1].trim(),
		};
	}
	return { team1: null, team2: null };
};

const IPL_NAME_RE = /indian\s+premier\s+league|indian-premier-league|\bipl\b/i;
const IPL_EXCLUDED_RE = /women|women's|womens|\bwpl\b/i;

const extractYearsFromText = (value) => {
	const years = [];
	for (const m of String(value || '').matchAll(/\b(20\d{2})\b/g)) {
		const y = Number(m[1]);
		if (Number.isFinite(y) && y >= 2008 && y <= 2100) years.push(y);
	}
	return years;
};

const buildSeriesMatchesUrl = (href) => {
	const abs = absoluteCricbuzzUrl(href);
	if (!abs) return null;
	const trimmed = String(abs).split('#')[0].split('?')[0].replace(/\/+$/, '');
	if (/\/matches$/i.test(trimmed)) return trimmed;
	return `${trimmed}/matches`;
};

const findLatestIplEditionMatchesUrl = async () => {
	const currentYear = new Date().getFullYear();
	const sourceUrls = [
		'https://www.cricbuzz.com/cricket-schedule/upcoming-series',
		'https://www.cricbuzz.com/cricket-schedule/upcoming-series/all',
		'https://www.cricbuzz.com/cricket-series',
		'https://www.cricbuzz.com/cricket-series/archives',
	];

	let best = null;

	for (const sourceUrl of sourceUrls) {
		// eslint-disable-next-line no-await-in-loop
		const html = await fetchPage(sourceUrl, 'ipl_series_lookup');
		if (!html) continue;

		const $ = cheerio.load(html);
		$('a[href*="/cricket-series/"]').each((_, el) => {
			const href = String($(el).attr('href') || '').trim();
			if (!href) return;
			if (/\/auction\//i.test(href)) return;
			if (!/\/cricket-series\/\d+\//i.test(href)) return;

			const text = normalizeWhitespace($(el).text());
			const hay = `${text} ${href}`.toLowerCase();
			if (!IPL_NAME_RE.test(hay)) return;
			if (IPL_EXCLUDED_RE.test(hay)) return;
			if (!/indian\s+premier\s+league|indian-premier-league/i.test(hay)) return;

			const years = extractYearsFromText(`${text} ${href}`);
			const year = years.length ? Math.max(...years) : null;

			let score = 0;
			if (/indian\s+premier\s+league|indian-premier-league/i.test(hay)) score += 300;
			if (/\/indian-premier-league-20\d{2}/i.test(href)) score += 120;
			if (href.includes('/matches')) score += 25;
			if (year != null) {
				if (year === currentYear) score += 160;
				else if (year === currentYear - 1) score += 140;
				else if (year < currentYear) score += Math.max(0, 120 - (currentYear - year) * 12);
				else score -= 30;
			}

			const candidate = {
				score,
				year: year ?? -1,
				href,
				text,
				matchesUrl: buildSeriesMatchesUrl(href),
			};

			if (!candidate.matchesUrl) return;

			if (!best) {
				best = candidate;
				return;
			}

			if (candidate.score > best.score) {
				best = candidate;
				return;
			}

			if (candidate.score === best.score && candidate.year > best.year) {
				best = candidate;
			}
		});
	}

	if (!best?.matchesUrl) return null;

	return {
		matchesUrl: best.matchesUrl,
		seriesName: best.text || `Indian Premier League ${best.year > 0 ? best.year : ''}`.trim(),
	};
};

const extractSeriesIdFromSeriesMatchesUrl = (seriesMatchesUrl) =>
	String(seriesMatchesUrl || '').match(/\/cricket-series\/(\d+)\//i)?.[1] || null;

const extractStructuredIplMatchesFromScan = ({ scan, seriesId, seriesName, matchUrlById }) => {
	const targetSeriesId = String(seriesId || '').trim();
	if (!scan) return [];

	const out = [];
	const re =
		/"matchInfo":\{[\s\S]{0,2200}?"matchId":(\d+)[\s\S]{0,140}?"seriesId":(\d+)[\s\S]{0,240}?"seriesName":"([^"]+)"[\s\S]{0,240}?"matchDesc":"([^"]+)"[\s\S]{0,180}?"matchFormat":"([^"]+)"[\s\S]{0,420}?"startDate":"?(\d+)"?[\s\S]{0,260}?"state":"([^"]+)"[\s\S]{0,900}?"status":"([^"]*)"[\s\S]{0,460}?"team1":\{[\s\S]{0,280}?"teamName":"([^"]+)"[\s\S]{0,140}?"teamSName":"([^"]+)"[\s\S]{0,460}?"team2":\{[\s\S]{0,280}?"teamName":"([^"]+)"[\s\S]{0,140}?"teamSName":"([^"]+)"/g;

	let m;
	while ((m = re.exec(scan)) !== null) {
		const matchId = String(m[1] || '').trim();
		const rawSeriesId = String(m[2] || '').trim();
		if (!matchId) continue;
		if (targetSeriesId && rawSeriesId !== targetSeriesId) continue;

		const parsedSeriesName = normalizeWhitespace(m[3]) || null;
		const matchDesc = normalizeWhitespace(m[4]) || null;
		const matchType = parseMatchType(m[5]) || 'T20';
		const startDate = Number.parseInt(String(m[6] || ''), 10);
		const state = normalizeWhitespace(m[7]);
		const status = normalizeWhitespace(m[8]);
		const team1 = normalizeWhitespace(m[10]) || normalizeWhitespace(m[9]) || null;
		const team2 = normalizeWhitespace(m[12]) || normalizeWhitespace(m[11]) || null;

		const stateHay = `${state} ${status}`.toLowerCase();
		const isUpcoming = /\b(upcoming|preview|scheduled|not started|match starts|starts at|to begin)\b/.test(stateHay);
		const isPlayed = /\b(complete|live|inprogress|in progress|toss|abandon|abandoned|stump|innings|result|won by|no result|rain)\b/.test(stateHay);
		if (isUpcoming || !isPlayed) continue;

		const isLive = /\b(live|inprogress|in progress|toss|stump|innings)\b/.test(stateHay);
		const matchUrl =
			matchUrlById.get(matchId) ||
			`https://www.cricbuzz.com/live-cricket-scores/${matchId}`;

		out.push({
			matchId,
			matchUrl,
			matchName: matchDesc,
			team1,
			team2,
			matchType,
			matchStatus: isLive ? 'LIVE' : 'TODAY',
			league: 'IPL',
			seriesName: seriesName || parsedSeriesName || 'Indian Premier League',
			rawText: status || state,
			startTime: Number.isFinite(startDate) ? startDate : null,
		});
	}

	return out;
};

const collectIplPlayedMatchesFromUrl = async ({ pageUrl, seriesId, seriesName, fetchLabel }) => {
	const html = await fetchPage(pageUrl, fetchLabel);
	if (!html) return [];

	const $ = cheerio.load(html);
	const matchUrlById = new Map();
	$('a[href*="/live-cricket-scores/"], a[href*="/cricket-scores/"]').each((_, el) => {
		const href = String($(el).attr('href') || '').trim();
		if (!isMatchHref(href)) return;
		const normalizedUrl = absoluteCricbuzzUrl(href);
		if (!normalizedUrl) return;
		const matchId = extractMatchIdFromUrl(normalizedUrl);
		if (!matchId) return;
		if (!matchUrlById.has(String(matchId))) {
			matchUrlById.set(String(matchId), normalizedUrl);
		}
	});

	try {
		const scan = String(html).replace(/\\u0026/g, '&').replace(/\\"/g, '"');
		const structuredMatches = extractStructuredIplMatchesFromScan({
			scan,
			seriesId,
			seriesName,
			matchUrlById,
		});
		if (structuredMatches.length > 0) {
			return structuredMatches;
		}
	} catch {
		// fall back to anchor parsing
	}

	const formatByMatchId = new Map();
	try {
		const scan = String(html).replace(/\\"/g, '"');
		const re = /"matchId"\s*:\s*(\d+)[\s\S]{0,700}?"matchFormat"\s*:\s*"(T20I?|ODI|TEST)"/gi;
		let m;
		while ((m = re.exec(scan)) !== null) {
			const fmt = parseMatchType(m[2]);
			if (fmt) formatByMatchId.set(String(m[1]), fmt);
		}
	} catch {
		// ignore
	}

	const anchors = $('a[href*="/live-cricket-scores/"], a[href*="/cricket-scores/"]');
	const matches = [];

	anchors.each((_, el) => {
		const $a = $(el);
		const href = $a.attr('href') || '';
		if (!isMatchHref(href)) return;

		const parsed = parseMatchCard($a);
		if (!parsed?.matchUrl) return;

		const teamsFromUrl = extractTeamsFromMatchUrlSlug(parsed.matchUrl);
		const team1 = parsed.team1 || teamsFromUrl.team1;
		const team2 = parsed.team2 || teamsFromUrl.team2;
		const urlSeries = extractSeriesNameFromMatchUrl(parsed.matchUrl);
		const urlLeague = deriveLeagueFromSeriesName(urlSeries);
		const isIplByUrl = urlLeague === 'IPL' || /indian-premier-league|\bipl\b/i.test(parsed.matchUrl);
		if (!isIplByUrl && !isLikelyIplTeamsPair(team1, team2)) return;

		const combinedText = `${parsed.contextText || ''} ${parsed.rawText || ''}`;
		if (!isLikelyPlayedIplMatchText(combinedText)) return;

		const matchId = extractMatchIdFromUrl(parsed.matchUrl);
		const matchType =
			parseMatchType(combinedText) ||
			(matchId ? formatByMatchId.get(String(matchId)) : null) ||
			'T20';

		matches.push({
			matchId: matchId || null,
			matchUrl: parsed.matchUrl,
			matchName: parsed.matchName,
			team1,
			team2,
			matchType,
			matchStatus: /\blive\b|\bopt to bat\b|\binnings\b|\bstumps\b|\b\d+(?:\.\d+)?\s*ov\b/i.test(combinedText)
				? 'LIVE'
				: 'TODAY',
			league: 'IPL',
			seriesName: seriesName || urlSeries || 'Indian Premier League',
			rawText: parsed.contextText || parsed.rawText,
		});
	});

	return matches;
};

const isLikelyPlayedIplMatchText = (value) => {
	const t = String(value || '').toLowerCase();
	if (!t) return false;

	const hasPlayedMarkers =
		/\b(live|won by|beat by|tied|no result|abandoned|drawn|stumps|innings|trail by|lead by|opt to bat|result)\b/.test(t) ||
		/\b\d+\/\d+\b/.test(t) ||
		/\b\d+(?:\.\d+)?\s*ov\b/.test(t);

	if (hasPlayedMarkers) return true;

	const hasUpcomingMarkers = /\b(match starts|starts in|preview|yet to begin|to begin|scheduled|upcoming)\b/.test(t);
	if (hasUpcomingMarkers) return false;

	return false;
};

export const scrapeLatestIplEditionMatchesPlayedSoFar = async () => {
	try {
		const now = Date.now();
		if (now - iplRecentEditionCache.ts < IPL_RECENT_EDITION_CACHE_TTL_MS && Array.isArray(iplRecentEditionCache.data)) {
			return iplRecentEditionCache.data;
		}

		const series = await findLatestIplEditionMatchesUrl();
		if (!series?.matchesUrl) {
			iplRecentEditionCache.ts = Date.now();
			iplRecentEditionCache.data = [];
			return [];
		}

		const pageCandidates = uniqueStrings([
			series.matchesUrl,
			`${series.matchesUrl}?tab=results`,
		]);
		const seriesId = extractSeriesIdFromSeriesMatchesUrl(series.matchesUrl);

		const allMatches = [];
		for (const pageUrl of pageCandidates) {
			// eslint-disable-next-line no-await-in-loop
			const fromPage = await collectIplPlayedMatchesFromUrl({
				pageUrl,
				seriesId,
				seriesName: series.seriesName,
				fetchLabel: 'ipl_recent_edition_matches',
			});
			if (fromPage.length > 0) allMatches.push(...fromPage);
		}

		const deduped = dedupeMatchesByKey(allMatches);
		void enrichMatchesWithFormat(deduped, { max: 16, delayMs: 120 });
		console.log(`[Scraper] IPL recent edition played matches: ${deduped.length}`);

		iplRecentEditionCache.ts = Date.now();
		iplRecentEditionCache.data = deduped;
		return deduped;
	} catch (error) {
		console.error('[Scraper] scrapeLatestIplEditionMatchesPlayedSoFar failed:', error?.message);
		return [];
	}
};



/**
 * MANDATORY: Scrape today's and live matches from Cricbuzz
 * Target URL: https://www.cricbuzz.com/cricket-match/live-scores
 * DOM: <a class="ds-no-tap-higlight" href="/series/.../live-cricket-score">
 */
export const scrapeLiveAndTodayMatches = async () => {
	try {
		const now = Date.now();
		if (now - matchListCache.liveToday.ts < MATCH_LIST_CACHE_TTL_MS && Array.isArray(matchListCache.liveToday.data)) {
			console.log('[Scraper] Returning cached LIVE/TODAY matches');
			return matchListCache.liveToday.data;
		}

		await delay(MATCH_LIST_SCRAPER_DELAY_MS);

		console.log('[Scraper] ====== Cricbuzz LIVE/TODAY matches ======');
		const url = 'https://www.cricbuzz.com/cricket-match/live-scores';
		const html = await fetchPage(url, 'cricbuzz_live_today');
		if (!html) {
			console.warn('[Scraper] Failed to fetch Cricbuzz live/today page');
			const retainedOnly = collectRetainedLiveTodayMatches([], now);
			matchListCache.liveToday = { ts: Date.now(), data: retainedOnly };
			return retainedOnly;
		}

		const $ = cheerio.load(html);
		// Cricbuzz pages often embed a JSON blob that includes matchFormat per matchId.
		// Extract those formats up-front so we can enrich results without extra requests.
		const formatByMatchId = new Map();
		try {
			const scan = String(html).replace(/\\"/g, '"');
			const re = /"matchId"\s*:\s*(\d+)[\s\S]{0,700}?"matchFormat"\s*:\s*"(T20I?|ODI|TEST)"/gi;
			let m;
			while ((m = re.exec(scan)) !== null) {
				const fmt = parseMatchType(m[2]);
				if (fmt) formatByMatchId.set(String(m[1]), fmt);
			}
		} catch {
			// ignore
		}
		const anchorsDsTypo = $('a.ds-no-tap-higlight');
		const anchorsDs = $('a.ds-no-tap-highlight');
		const anchorsHref = $('a[href*="/live-cricket-scores/"], a[href*="/live-cricket-score"]');

		console.log(`[Scraper] Anchors ds-no-tap-higlight: ${anchorsDsTypo.length}`);
		console.log(`[Scraper] Anchors ds-no-tap-highlight: ${anchorsDs.length}`);
		console.log(`[Scraper] Anchors href live-cricket-score(s): ${anchorsHref.length}`);

		const anchors = anchorsDsTypo.length
			? anchorsDsTypo
			: anchorsDs.length
				? anchorsDs
				: anchorsHref;
		console.log(`[Scraper] Matches found (anchors selected): ${anchors.length}`);

		const matches = [];
		anchors.each((idx, el) => {
			const $a = $(el);
			const href = $a.attr('href') || '';
			if (!isMatchHref(href)) return;
			const parsed = parseMatchCard($a);
			if (!parsed?.matchUrl) return;
			if (!parsed?.rawText || parsed.rawText.length < 3) return;
			const matchId = extractMatchIdFromUrl(parsed.matchUrl);
			const matchFormatFromPage = matchId ? formatByMatchId.get(String(matchId)) : null;
			const matchType =
				parseMatchType(parsed.contextText || parsed.matchName || parsed.rawText) ||
				parseMatchType(parsed.matchUrl) ||
				parseMatchType(matchFormatFromPage);
			matches.push({
				matchUrl: parsed.matchUrl,
				matchName: parsed.matchName,
				team1: parsed.team1,
				team2: parsed.team2,
				seriesName: parsed.seriesName,
				league: parsed.league,
				matchType,
				matchStatus: parsed.matchStatus,
				rawText: parsed.contextText || parsed.rawText,
			});
		});

		if (matches.length === 0) {
			console.warn('No matches found — DOM may have changed');
			const retainedOnly = collectRetainedLiveTodayMatches([], now);
			matchListCache.liveToday = { ts: Date.now(), data: retainedOnly };
			return retainedOnly;
		}

		// Fill formats from cache immediately (fast path)
		for (const m of matches) {
			if (m?.matchType) continue;
			const cachedFormat = m?.matchUrl ? getCachedMatchFormat(m.matchUrl) : null;
			if (cachedFormat) m.matchType = cachedFormat;
		}

		rememberLiveTodayMatches(matches, now);
		const retainedRecent = collectRetainedLiveTodayMatches(matches, now);
		const combinedMatches = dedupeMatchesByKey([...matches, ...retainedRecent]);

		void enrichMatchesWithFormat(combinedMatches, { max: 8, delayMs: 150 });

		console.log(`[Scraper] Retained recent matches: ${retainedRecent.length}`);
		console.log('[Scraper] First match object:', combinedMatches[0]);
		matchListCache.liveToday = { ts: Date.now(), data: combinedMatches };
		return combinedMatches;
	} catch (error) {
		console.error('[Scraper] scrapeLiveAndTodayMatches failed:', error?.message);
		return [];
	}
};

// Backwards compatible export used by existing controller/routes
export const scrapeTodayAndLiveMatches = scrapeLiveAndTodayMatches;

/**
 * Scrape upcoming matches
 * Uses web scraping from Cricbuzz as primary, ESPN as fallback
 */
export const scrapeUpcomingMatches = async () => {
	try {
		const now = Date.now();
		if (now - matchListCache.upcoming.ts < MATCH_LIST_CACHE_TTL_MS && Array.isArray(matchListCache.upcoming.data)) {
			console.log('[Scraper] Returning cached UPCOMING matches');
			return matchListCache.upcoming.data;
		}

		await delay(MATCH_LIST_SCRAPER_DELAY_MS);

		console.log('[Scraper] ====== Cricbuzz UPCOMING matches ======');
		const mandatedUrl = 'https://www.cricbuzz.com/cricket-schedule/upcoming-series';
		let html = await fetchPage(mandatedUrl, 'cricbuzz_upcoming');
		if (!html) {
			console.warn('[Scraper] Mandated upcoming URL returned no HTML; trying known working fallback');
			html = await fetchPage('https://www.cricbuzz.com/cricket-schedule/upcoming-series/all', 'cricbuzz_upcoming_fallback_all');
		}
		if (!html) {
			console.warn('[Scraper] Upcoming series page unavailable; falling back to live-scores page for upcoming fixtures');
			html = await fetchPage('https://www.cricbuzz.com/cricket-match/live-scores', 'cricbuzz_upcoming_fallback_live_scores');
		}
		if (!html) {
			console.warn('[Scraper] Failed to fetch Cricbuzz upcoming page (all attempts)');
			return [];
		}

		const $ = cheerio.load(html);
		// Upcoming schedule pages can also embed matchFormat keyed by matchId.
		const formatByMatchId = new Map();
		try {
			const scan = String(html).replace(/\\"/g, '"');
			const re = /"matchId"\s*:\s*(\d+)[\s\S]{0,700}?"matchFormat"\s*:\s*"(T20I?|ODI|TEST)"/gi;
			let m;
			while ((m = re.exec(scan)) !== null) {
				const fmt = parseMatchType(m[2]);
				if (fmt) formatByMatchId.set(String(m[1]), fmt);
			}
		} catch {
			// ignore
		}
		// Per requirement: select match anchors (use ds anchor when present, otherwise fall back to match links)
		const anchorsDsTypo = $('a.ds-no-tap-higlight');
		const anchorsDs = $('a.ds-no-tap-highlight');
		const anchorsFallback = $('a[href*="/live-cricket-scores/"], a[href*="/cricket-scores/"]');
		const anchors = anchorsDsTypo.length ? anchorsDsTypo : anchorsDs.length ? anchorsDs : anchorsFallback;

		console.log(`[Scraper] Matches found (anchors): ${anchors.length}`);
		const matches = [];

		anchors.each((idx, el) => {
			const $a = $(el);
			const href = $a.attr('href') || '';
			if (!isMatchHref(href)) return;
			const parsed = parseMatchCard($a);
			if (!parsed?.matchUrl) return;
			if (!parsed?.rawText || parsed.rawText.length < 3) return;
			const matchId = extractMatchIdFromUrl(parsed.matchUrl);
			const matchFormatFromPage = matchId ? formatByMatchId.get(String(matchId)) : null;
			const matchType =
				parseMatchType(parsed.contextText || parsed.matchName || parsed.rawText) ||
				parseMatchType(parsed.matchUrl) ||
				parseMatchType(matchFormatFromPage);

			// Upcoming filter: prefer previews / not-started matches.
			const t = parsed.rawText.toLowerCase();
			const looksStartedOrDone = /opt to bat|\bwon\b|\b\d+\/\d+\b|stumps|innings|\bov\b/.test(t);
			const looksUpcoming = /preview|match starts|starts in|\btoday\b|\btomorrow\b|\d{1,2}:\d{2}|\b(am|pm)\b/.test(t);
			if (looksStartedOrDone && !looksUpcoming) return;
			if (!looksUpcoming) return;
			matches.push({
				matchUrl: parsed.matchUrl,
				matchName: parsed.matchName,
				team1: parsed.team1,
				team2: parsed.team2,
				seriesName: parsed.seriesName,
				league: parsed.league,
				matchType,
				matchStatus: 'UPCOMING',
				startTimeText: parsed.startTimeText,
				rawText: parsed.contextText || parsed.rawText,
			});
		});

		if (matches.length === 0) {
			console.warn('No matches found — DOM may have changed');
			return [];
		}

		// Fill formats from cache immediately (fast path)
		for (const m of matches) {
			if (m?.matchType) continue;
			const cachedFormat = m?.matchUrl ? getCachedMatchFormat(m.matchUrl) : null;
			if (cachedFormat) m.matchType = cachedFormat;
		}

		void enrichMatchesWithFormat(matches, { max: 8, delayMs: 150 });

		console.log('[Scraper] First match object:', matches[0]);
		matchListCache.upcoming = { ts: Date.now(), data: matches };
		return matches;
	} catch (error) {
		console.error('[Scraper] scrapeUpcomingMatches error:', error?.message);
		return [];
	}
};

export const scrapeMatchSquadsAndPlayingXI = async (matchId, options = {}) => {
	const id = String(matchId || '').trim();
	if (!id) return null;

	const preferredTeam1Name = normalizeWhitespace(options?.team1Name || '') || null;
	const preferredTeam2Name = normalizeWhitespace(options?.team2Name || '') || null;

	const cached = squadsCache.get(id);
	if (cached && Date.now() - cached.ts < SQUADS_CACHE_TTL_MS) {
		const cachedData = cached.data;
		const team1Cached = uniquePlayers(cachedData?.team1?.squad || []);
		const team2Cached = uniquePlayers(cachedData?.team2?.squad || []);
		const mergedCached = uniquePlayers([...(cachedData?.players || []), ...team1Cached, ...team2Cached]);
		const hasStaffLeak = mergedCached.some((name) => isLikelyStaffContext(name));
		const hasTeamSeparation = team1Cached.length > 0 || team2Cached.length > 0;

		if (hasTeamSeparation && !hasStaffLeak) return cachedData;
		squadsCache.delete(id);
	}

	// Prefer IPL recent results metadata for historical IPL IDs to keep team order stable,
	// then fall back to live/today and upcoming lists.
	const [todayLive, upcoming, iplRecent] = await Promise.all([
		scrapeTodayAndLiveMatches(),
		scrapeUpcomingMatches(),
		scrapeLatestIplEditionMatchesPlayedSoFar(),
	]);

	const findById = (arr) =>
		(Array.isArray(arr) ? arr : []).find((m) => String(m?.matchUrl || '').includes(`/${id}/`)) || null;

	let match =
		findById(iplRecent) ||
		findById(todayLive) ||
		findById(upcoming) ||
		null;

	if (!match?.matchUrl) {
		const scorecard = await scrapeCricbuzzScorecardPlayerStats(id).catch(() => null);
		const header = scorecard?.matchHeader || {};
		const stateText = normalizeWhitespace(
			`${header?.state || ''} ${header?.status || ''} ${header?.statusText || ''} ${header?.stateTitle || ''}`,
		).toLowerCase();
		const headerLooksCompleted = /\b(complete|completed|result|won\s+by|beat\s+by|no\s+result|abandoned?|tied|match\s+over|stumps?)\b/.test(stateText);

		if (headerLooksCompleted) {
			match = {
				matchId: id,
				matchUrl: `https://www.cricbuzz.com/live-cricket-scores/${id}/`,
				team1: normalizeWhitespace(header?.team1?.name || header?.team1?.shortName || preferredTeam1Name || ''),
				team2: normalizeWhitespace(header?.team2?.name || header?.team2?.shortName || preferredTeam2Name || ''),
				matchStatus: 'COMPLETED',
				rawText: stateText,
			};
		}
	}

	const preferSquadOnly = options?.preferSquadOnly === true
		? true
		: !isLikelyCompletedMatch(match);

	let data = null;
	let resolvedMatchUrl = null;
	let resolvedTeam1Name = null;
	let resolvedTeam2Name = null;

	const candidateMatchUrls = uniqueStrings([
		match?.matchUrl,
		`https://www.cricbuzz.com/live-cricket-scores/${id}/`,
		`https://www.cricbuzz.com/cricket-scores/${id}/`,
	]);

	for (const candidateUrl of candidateMatchUrls) {
		const teamsFromUrl = extractTeamsFromMatchUrlSlug(candidateUrl);
		const team1Name = normalizeWhitespace(preferredTeam1Name || match?.team1 || teamsFromUrl?.team1 || '') || null;
		const team2Name = normalizeWhitespace(preferredTeam2Name || match?.team2 || teamsFromUrl?.team2 || '') || null;

		// eslint-disable-next-line no-await-in-loop
		const out = await scrapeCricbuzzSquadsAndPlayingXIFromMatchUrl(candidateUrl, {
			team1Name,
			team2Name,
			preferSquadOnly,
		});

		if (out) {
			data = out;
			resolvedMatchUrl = candidateUrl;
			resolvedTeam1Name = normalizeWhitespace(out?.teamNames?.team1 || team1Name || '') || null;
			resolvedTeam2Name = normalizeWhitespace(out?.teamNames?.team2 || team2Name || '') || null;
			break;
		}
	}

	if (!data) return null;

	const team1Squad = uniquePlayers(data?.squad?.team1 || []);
	const team2Squad = uniquePlayers(data?.squad?.team2 || []);
	const team1XI = uniquePlayers(data?.playingXIByTeam?.team1 || []);
	const team2XI = uniquePlayers(data?.playingXIByTeam?.team2 || []);
	const players = uniquePlayers(data?.players?.length ? data.players : [...team1Squad, ...team2Squad]);
	const playingXI = uniquePlayers(data?.playingXI?.length ? data.playingXI : [...team1XI, ...team2XI]);

	const normalized = {
		matchId: id,
		matchUrl: match?.matchUrl || resolvedMatchUrl || null,
		matchName: match?.matchName || null,
		team1: {
			name: resolvedTeam1Name,
			squad: team1Squad,
			playingXI: team1XI,
		},
		team2: {
			name: resolvedTeam2Name,
			squad: team2Squad,
			playingXI: team2XI,
		},
		players,
		playingXI,
		isPlayingXIDeclared: data?.isPlayingXIDeclared ?? null,
		sourceUrl: data.sourceUrl || null,
	};

	squadsCache.set(id, { ts: Date.now(), data: normalized });
	return normalized;
};

export const getCricbuzzMatchStateById = async (matchId) => {
	const id = String(matchId || '').trim();
	if (!id) return { state: 'UNKNOWN', match: null };

	const [todayLive, upcoming] = await Promise.all([scrapeTodayAndLiveMatches(), scrapeUpcomingMatches()]);
	const todayList = Array.isArray(todayLive) ? todayLive : [];
	const upcomingList = Array.isArray(upcoming) ? upcoming : [];

	const findById = (list) =>
		list.find((m) => {
			const url = String(m?.matchUrl || '');
			return url.includes(`/${id}/`);
		}) || null;

	const todayMatch = findById(todayList);
	if (todayMatch) {
		const raw = String(todayMatch?.matchStatus || '').toUpperCase();
		const state = raw === 'LIVE' ? 'LIVE' : 'TODAY';
		return { state, match: todayMatch };
	}

	const upcomingMatch = findById(upcomingList);
	if (upcomingMatch) return { state: 'UPCOMING', match: upcomingMatch };

	return { state: 'UNKNOWN', match: null };
};

/**
 * Scrape match details from a specific match URL
 * Extracts venue, format, timing, and team information
 */
export const scrapeMatchDetails = async (matchUrl) => {
	try {
		if (!matchUrl) {
			console.warn('[Scraper] scrapeMatchDetails: No URL provided');
			return null;
		}

		await delay(SCRAPER_DELAY_MS);

		// Ensure absolute URL
		let url = matchUrl;
		if (!url.startsWith('http')) {
			url = `https://www.espncricinfo.com${url}`;
		}

		console.log(`[Scraper] Fetching match details from: ${url}`);
		const html = await fetchPage(url, 'match_details');
		
		if (!html) {
			console.warn('[Scraper] Failed to fetch match details page');
			return null;
		}

		console.log(`[Scraper] Match details HTML length: ${html.length} bytes`);

		const $ = cheerio.load(html);

		// Extract match info from page using multiple selectors
		let matchName = null;
		matchName = $('h1').first().text()?.trim() || null;
		if (!matchName) {
			matchName = $('[class*="heading"]').first().text()?.trim() || null;
		}
		if (!matchName) {
			matchName = $('title').text()?.trim() || null;
		}

		const venueText = $('[class*="venue"], [class*="ground"], span:contains("Venue")').text()?.trim() || null;
		const statusText = $('[class*="status"], [class*="state"]').text()?.trim() || null;

		const { team1, team2 } = parseTeams(matchName);
		const inferredType = parseMatchType(matchName);
		let resolvedType = inferredType;
		// Cricbuzz commentary/title strings often omit the format; fall back to embedded matchFormat.
		if (!resolvedType && url.includes('cricbuzz.com')) {
			resolvedType = await scrapeMatchFormatFromCricbuzz(url);
		}

		const details = {
			matchUrl: url,
			matchName: matchName || null,
			teams: [
				{ name: team1, shortName: null },
				{ name: team2, shortName: null },
			].filter((t) => t.name),
			venue: venueText || null,
			matchType: resolvedType,
			matchStatus: parseMatchStatus(statusText),
			startTime: null,
		};

		console.log(`[Scraper] Extracted match details: ${details.matchName}`);
		return details;

	} catch (error) {
		console.error('[Scraper] scrapeMatchDetails failed:', error?.message);
		console.error('[Scraper] Stack trace:', error?.stack);
		return null;
	}
};

/**
 * Scrape scorecard from a match URL
 * Returns player batting and bowling statistics for completed matches
 */
export const scrapeMatchScorecard = async (matchUrl) => {
	try {
		if (!matchUrl) {
			console.warn('[Scraper] scrapeMatchScorecard: No URL provided');
			return null;
		}

		await delay(SCRAPER_DELAY_MS);

		let url = matchUrl;
		if (!url.startsWith('http')) {
			url = `https://www.espncricinfo.com${url}`;
		}

		// Append full-scorecard path if not already there
		if (!url.includes('/full-scorecard')) {
			url = url + '/full-scorecard';
		}

		console.log(`[Scraper] Fetching scorecard from: ${url}`);
		const html = await fetchPage(url, 'match_scorecard');
		
		if (!html) {
			console.warn('[Scraper] Failed to fetch match scorecard page');
			return null;
		}

		console.log(`[Scraper] Scorecard HTML length: ${html.length} bytes`);

		const $ = cheerio.load(html);

		// Check if match is completed
		const statusText = $('[class*="status"]').text() || '';
		const pageTitle = $('title').text() || '';
		
		console.log(`[Scraper] Match status text: "${statusText.substring(0, 100)}..."`);

		if (!statusText.toLowerCase().includes('completed') &&
			!statusText.toLowerCase().includes('finished') &&
			!statusText.toLowerCase().includes('result') &&
			!pageTitle.toLowerCase().includes('scorecard')) {
			console.warn('[Scraper] Match not completed yet or not a scorecard page');
			return null;
		}

		// Extract scorecard table data
		const battingStats = [];
		const bowlingStats = [];

		console.log('[Scraper] Parsing batting statistics...');

		// Parse batting tables - ESPNcricinfo has specific structures
		$('table tbody tr').each((idx, el) => {
			try {
				const $row = $(el);
				const cells = $row.find('td');

				if (cells.length >= 3) {
					const playerName = $(cells[0]).text()?.trim() || '';
					const runs = $(cells[1]).text()?.trim() || '0';
					const balls = $(cells[2]).text()?.trim() || '0';
					const fours = cells.length > 3 ? $(cells[3]).text()?.trim() || '0' : '0';
					const sixes = cells.length > 4 ? $(cells[4]).text()?.trim() || '0' : '0';

					if (playerName && playerName.length > 2) {
						battingStats.push({
							playerName,
							runs: parseInt(runs, 10) || 0,
							balls: parseInt(balls, 10) || 0,
							fours: parseInt(fours, 10) || 0,
							sixes: parseInt(sixes, 10) || 0,
						});
					}
				}
			} catch (err) {
				console.debug(`[Scraper] Error parsing batting row ${idx}:`, err.message);
			}
		});

		console.log('[Scraper] Parsing bowling statistics...');

		// Parse bowling tables
		$('table tbody tr').each((idx, el) => {
			try {
				const $row = $(el);
				const cells = $row.find('td');

				if (cells.length >= 4) {
					const playerName = $(cells[0]).text()?.trim() || '';
					const overs = $(cells[1]).text()?.trim() || '0';
					const maidens = $(cells[2]).text()?.trim() || '0';
					const runs = $(cells[3]).text()?.trim() || '0';
					const wickets = cells.length > 4 ? $(cells[4]).text()?.trim() || '0' : '0';

					// Filter to bowling stats (runs and wickets columns usually have numbers)
					if (playerName && playerName.length > 2 && (parseInt(overs, 10) > 0 || parseInt(runs, 10) > 0)) {
						bowlingStats.push({
							playerName,
							overs: overs,
							maidens: parseInt(maidens, 10) || 0,
							runs: parseInt(runs, 10) || 0,
							wickets: parseInt(wickets, 10) || 0,
						});
					}
				}
			} catch (err) {
				console.debug(`[Scraper] Error parsing bowling row ${idx}:`, err.message);
			}
		});

		const scorecard = {
			matchUrl: url,
			status: 'COMPLETED',
			batting: battingStats.slice(0, 50),
			bowling: bowlingStats.slice(0, 20),
		};

		console.log(`[Scraper] Extracted scorecard: ${battingStats.length} batting, ${bowlingStats.length} bowling records`);
		return scorecard;

	} catch (error) {
		console.error('[Scraper] scrapeMatchScorecard failed:', error?.message);
		console.error('[Scraper] Stack trace:', error?.stack);
		return null;
	}
};

/**
 * Get a normalized match summary for display
 * This is a helper for API responses
 */
export const getNormalizedMatches = async (matchType = 'live') => {
	let matches = [];

	if (matchType === 'live') {
		matches = await scrapeTodayAndLiveMatches();
	} else if (matchType === 'upcoming') {
		matches = await scrapeUpcomingMatches();
	}

	// Normalize response format
	return matches.map((m) => ({
		matchId: m.matchId,
		matchName: m.matchName,
		teams: m.teams || [],
		matchType: m.matchType,
		matchStatus: m.matchStatus,
		matchUrl: m.matchUrl,
	}));
};

export default {
	scrapeTodayAndLiveMatches,
	scrapeUpcomingMatches,
	scrapeLatestIplEditionMatchesPlayedSoFar,
	scrapeMatchDetails,
	scrapeMatchScorecard,
	scrapeCricbuzzScorecardPlayerStats,
	getNormalizedMatches,
};
