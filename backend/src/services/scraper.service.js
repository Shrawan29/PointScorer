import axios from 'axios';
import cheerio from 'cheerio';

const SCRAPER_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 15000);
const SCRAPER_DELAY_MS = Number(process.env.SCRAPER_DELAY_MS || 3000);
const MATCH_LIST_SCRAPER_DELAY_MS = Number(process.env.MATCH_LIST_SCRAPER_DELAY_MS || 250);

const MATCH_LIST_CACHE_TTL_MS = Number(process.env.MATCH_LIST_CACHE_TTL_MS || 60_000);
const MATCH_FORMAT_CACHE_TTL_MS = Number(process.env.MATCH_FORMAT_CACHE_TTL_MS || 6 * 60 * 60_000);
const SQUADS_CACHE_TTL_MS = Number(process.env.SQUADS_CACHE_TTL_MS || 5 * 60_000);
const SCORECARD_STATS_CACHE_TTL_MS = Number(process.env.SCORECARD_STATS_CACHE_TTL_MS || 60_000);

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

const splitPlayersList = (value) => {
	if (!value) return [];
	return uniqueStrings(
		String(value)
			.split(/,|\u2022|\||\r?\n/)
			.map((s) => normalizeWhitespace(s))
			.filter(Boolean),
	);
};

const normalizePlayerKey = (value) =>
	normalizeWhitespace(value)
		.replace(/[\u2020†]/g, '')
		.replace(/\([^)]*\)/g, '')
		.replace(/[,]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

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
		const rememberName = (playerId, name) => {
			const pid = String(playerId || '').trim();
			const nm = normalizeWhitespace(name);
			if (!pid || !nm) return;
			if (!playerNameById[pid]) playerNameById[pid] = nm;
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
			const batsmenData = innings?.batTeamDetails?.batsmenData || {};
			for (const b of Object.values(batsmenData)) {
				if (!b || !b.batId) continue;
				rememberName(b.batId, b.batName || b.batShortName);
				bump(b.batId, { runs: b.runs, fours: b.fours, sixes: b.sixes });

				const wicketCode = b.wicketCode;
				const f1 = toInt(b.fielderId1);
				const f2 = toInt(b.fielderId2);
				if (isCatchCode(wicketCode)) {
					if (f1 > 0) bump(f1, { catches: 1 });
				} else if (isRunoutCode(wicketCode)) {
					if (f1 > 0) bump(f1, { runouts: 1 });
					if (f2 > 0 && f2 !== f1) bump(f2, { runouts: 1 });
				}
			}

			const bowlersData = innings?.bowlTeamDetails?.bowlersData || {};
			for (const bw of Object.values(bowlersData)) {
				if (!bw || !bw.bowlerId) continue;
				rememberName(bw.bowlerId, bw.bowlerName || bw.bowlName || bw.bowlerShortName);
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

const scrapeCricbuzzSquadsAndPlayingXIFromMatchUrl = async (matchUrl) => {
	if (!matchUrl) return null;
	await delay(SCRAPER_DELAY_MS);

	const matchId = extractMatchIdFromUrl(matchUrl);
	const base = String(matchUrl);
	const urlCandidates = [];

	// Prefer links found on the match page (most stable), but fall back to common patterns.
	urlCandidates.push(base);
	if (base.includes('/live-cricket-scores/')) {
		urlCandidates.push(base.replace('/live-cricket-scores/', '/cricket-scores/'));
		urlCandidates.push(`${base}/scorecard`);
		urlCandidates.push(`${base}/squads`);
	}
	if (matchId) {
		urlCandidates.push(`https://www.cricbuzz.com/cricket-scores/${matchId}`);
		urlCandidates.push(`https://www.cricbuzz.com/cricket-scores/${matchId}/scorecard`);
		urlCandidates.push(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`);
		urlCandidates.push(`https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`);
	}

	const { html: matchHtml } = await tryFetchFirstWorking([base], `cricbuzz_match_${matchId || 'page'}`);
	if (!matchHtml) return null;

	const $match = cheerio.load(matchHtml);
	const scorecardHref = $match('a')
		.toArray()
		.map((el) => ({ href: el?.attribs?.href, text: normalizeWhitespace($match(el).text()) }))
		.find((a) => a?.href && /scorecard/i.test(a.text || '') && String(a.href).includes(String(matchId || '')))?.href;
	if (scorecardHref) urlCandidates.unshift(absoluteCricbuzzUrl(scorecardHref));

	const { url: fetchedUrl, html } = await tryFetchFirstWorking(uniqueStrings(urlCandidates), `cricbuzz_squads_${matchId || 'x'}`);
	if (!html) return null;

	const $ = cheerio.load(html);

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

	const playingXI = [];
	for (const line of textBlobs) {
		if (!/playing\s*xi/i.test(line)) continue;
		const after = line.split(/playing\s*xi\s*[:\-]/i)[1];
		if (!after) continue;
		const players = splitPlayersList(after);
		if (players.length >= 8) {
			playingXI.push(...players);
		}
	}

	// Attempt 2: get player names from player profile links (fallback)
	const profilePlayers = uniqueStrings(
		$('a[href*="/profiles/"]')
			.toArray()
			.map((el) => normalizeWhitespace($(el).text()))
			.filter((name) => name && name.length >= 3 && name.length <= 40),
	);

	const allPlayers = uniqueStrings([...(playingXI.length ? playingXI : []), ...profilePlayers]);

	return {
		matchId: matchId || null,
		matchUrl,
		sourceUrl: fetchedUrl,
		players: allPlayers,
		playingXI: uniqueStrings(playingXI),
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

	return {
		matchUrl,
		matchName,
		team1,
		team2,
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
			return [];
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
				matchType,
				matchStatus: parsed.matchStatus,
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
		matchListCache.liveToday = { ts: Date.now(), data: matches };
		return matches;
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

export const scrapeMatchSquadsAndPlayingXI = async (matchId) => {
	const id = String(matchId || '').trim();
	if (!id) return null;

	const cached = squadsCache.get(id);
	if (cached && Date.now() - cached.ts < SQUADS_CACHE_TTL_MS) return cached.data;

	// Find the match URL from our cached lists
	const [todayLive, upcoming] = await Promise.all([scrapeTodayAndLiveMatches(), scrapeUpcomingMatches()]);
	const list = [...(todayLive || []), ...(upcoming || [])];
	const match = list.find((m) => String(m?.matchUrl || '').includes(`/${id}/`)) || null;
	if (!match?.matchUrl) return null;

	const data = await scrapeCricbuzzSquadsAndPlayingXIFromMatchUrl(match.matchUrl);
	if (!data) return null;
	const normalized = {
		matchId: id,
		matchUrl: match.matchUrl,
		matchName: match.matchName || null,
		team1: match.team1 || null,
		team2: match.team2 || null,
		players: data.players || [],
		playingXI: data.playingXI || [],
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
	scrapeMatchDetails,
	scrapeMatchScorecard,
	scrapeCricbuzzScorecardPlayerStats,
	getNormalizedMatches,
};
