import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import RawPlayerStats from '../models/RawPlayerStats.model.js';
import RuleSet from '../models/RuleSet.model.js';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const COUNT_EVENT_DEFS = {
	run: { label: 'Runs', statKey: 'runs' },
	four: { label: 'Fours', statKey: 'fours' },
	six: { label: 'Sixes', statKey: 'sixes' },
	wicket: { label: 'Wickets', statKey: 'wickets' },
	catch: { label: 'Catches', statKey: 'catches' },
	runout: { label: 'Runouts', statKey: 'runouts' },
};

const MILESTONE_EVENT_DEFS = {
	fifty: {
		label: 'Fifty bonus (runs ≥ 50)',
		isMet: (stats) => toNumber(stats?.runs) >= 50,
	},
	hundred: {
		label: 'Hundred bonus (runs ≥ 100)',
		isMet: (stats) => toNumber(stats?.runs) >= 100,
	},
	threeWicket: {
		label: '3-wicket bonus (wkts ≥ 3)',
		isMet: (stats) => toNumber(stats?.wickets) >= 3,
	},
	fiveWicket: {
		label: '5-wicket bonus (wkts ≥ 5)',
		isMet: (stats) => toNumber(stats?.wickets) >= 5,
	},
};

const buildCountLine = ({ event, label, count, rule }) => {
	const pointsPerUnit = toNumber(rule?.points);
	const multiplier = typeof rule?.multiplier === 'number' ? rule.multiplier : 1;
	const points = toNumber(count) * pointsPerUnit * multiplier;
	const formula = multiplier === 1
		? `${toNumber(count)} × ${pointsPerUnit} = ${points}`
		: `${toNumber(count)} × ${pointsPerUnit} × ${multiplier} = ${points}`;

	return {
		kind: 'count',
		event,
		label,
		count: toNumber(count),
		pointsPerUnit,
		multiplier,
		points,
		formula,
	};
};

const buildMilestoneLine = ({ event, label, met, rule }) => {
	const base = met ? toNumber(rule?.points) : 0;
	const multiplier = typeof rule?.multiplier === 'number' ? rule.multiplier : 1;
	const points = base * multiplier;
	const formula = met
		? multiplier === 1
			? `${toNumber(rule?.points)} = ${points}`
			: `${toNumber(rule?.points)} × ${multiplier} = ${points}`
		: `0 = 0`;

	return {
		kind: 'milestone',
		event,
		label,
		met: Boolean(met),
		points,
		multiplier,
		formula,
	};
};

const buildCaptainMultiplierLine = ({ multiplier, before, after }) => {
	return {
		kind: 'multiplier',
		event: 'captainMultiplier',
		label: 'Captain multiplier',
		multiplier,
		before,
		after,
		points: after,
		formula: `${before} × ${multiplier} = ${after}`,
	};
};

const buildPlayerBreakdown = ({ playerId, rules, stats, isCaptain }) => {
	const enabledRules = Array.isArray(rules) ? rules.filter((r) => r && r.enabled !== false) : [];
	const safeStats = stats || {};

	const lines = [];
	let subtotal = 0;
	let captainRule = null;

	for (const rule of enabledRules) {
		const event = rule?.event;
		if (!event || typeof event !== 'string') continue;

		if (event === 'captainMultiplier') {
			captainRule = rule;
			continue;
		}

		if (COUNT_EVENT_DEFS[event]) {
			const def = COUNT_EVENT_DEFS[event];
			const count = toNumber(safeStats?.[def.statKey]);
			const line = buildCountLine({ event, label: def.label, count, rule });
			lines.push(line);
			subtotal += toNumber(line.points);
			continue;
		}

		if (MILESTONE_EVENT_DEFS[event]) {
			const def = MILESTONE_EVENT_DEFS[event];
			const met = def.isMet(safeStats);
			const line = buildMilestoneLine({ event, label: def.label, met, rule });
			lines.push(line);
			subtotal += toNumber(line.points);
			continue;
		}
	}

	let totalPoints = subtotal;
	let captainLine = null;
	if (isCaptain && captainRule && captainRule.enabled !== false) {
		const multiplier = typeof captainRule.multiplier === 'number' ? captainRule.multiplier : 1;
		totalPoints = subtotal * multiplier;
		captainLine = buildCaptainMultiplierLine({ multiplier, before: subtotal, after: totalPoints });
		lines.push(captainLine);
	}

	return {
		playerId: String(playerId),
		isCaptain: Boolean(isCaptain),
		stats: {
			runs: toNumber(safeStats?.runs),
			fours: toNumber(safeStats?.fours),
			sixes: toNumber(safeStats?.sixes),
			wickets: toNumber(safeStats?.wickets),
			catches: toNumber(safeStats?.catches),
			runouts: toNumber(safeStats?.runouts),
		},
		subtotal,
		totalPoints,
		lines,
	};
};

export const buildDetailedBreakdownForSessionId = async ({ sessionId, userId }) => {
	if (!sessionId) {
		const err = new Error('sessionId is required');
		err.statusCode = 400;
		throw err;
	}
	if (!mongoose.Types.ObjectId.isValid(sessionId)) {
		const err = new Error('Invalid sessionId');
		err.statusCode = 400;
		throw err;
	}

	const session = await MatchSession.findOne({ _id: sessionId, userId }).lean();
	if (!session) {
		const err = new Error('MatchSession not found');
		err.statusCode = 404;
		throw err;
	}

	const [friend, ruleset, selection] = await Promise.all([
		Friend.findOne({ _id: session.friendId, userId }).lean(),
		RuleSet.findOne({ _id: session.rulesetId, userId }).lean(),
		PlayerSelection.findOne({ sessionId }).lean(),
	]);

	if (!friend) {
		const err = new Error('Friend not found');
		err.statusCode = 404;
		throw err;
	}
	if (!ruleset) {
		const err = new Error('RuleSet not found');
		err.statusCode = 404;
		throw err;
	}
	if (!selection) {
		const err = new Error('PlayerSelection not found');
		err.statusCode = 404;
		throw err;
	}

	const userPlayers =
		Array.isArray(selection.userPlayers) && selection.userPlayers.length > 0
			? selection.userPlayers
			: Array.isArray(selection.selectedPlayers)
				? selection.selectedPlayers
				: [];
	const friendPlayers = Array.isArray(selection.friendPlayers) ? selection.friendPlayers : [];
	const userCaptain = selection.userCaptain ?? selection.captain ?? null;
	const friendCaptain = selection.friendCaptain ?? null;

	const rawStats = await RawPlayerStats.find({ sessionId }).lean();
	const rawByPlayerId = new Map(rawStats.map((s) => [String(s.playerId), s]));

	const user = userPlayers.map((playerId) => {
		const stats = rawByPlayerId.get(String(playerId)) || { playerId };
		const isCaptain = Boolean(userCaptain && String(playerId) === String(userCaptain));
		return buildPlayerBreakdown({ playerId, rules: ruleset.rules, stats, isCaptain });
	});

	const friendTeam = friendPlayers.map((playerId) => {
		const stats = rawByPlayerId.get(String(playerId)) || { playerId };
		const isCaptain = Boolean(friendCaptain && String(playerId) === String(friendCaptain));
		return buildPlayerBreakdown({ playerId, rules: ruleset.rules, stats, isCaptain });
	});

	const userTotalPoints = user.reduce((sum, p) => sum + toNumber(p?.totalPoints), 0);
	const friendTotalPoints = friendTeam.reduce((sum, p) => sum + toNumber(p?.totalPoints), 0);

	return {
		sessionId: String(sessionId),
		generatedAt: new Date().toISOString(),
		match: {
			realMatchId: session.realMatchId,
			realMatchName: session.realMatchName,
			status: session.status,
		},
		friend: {
			friendId: String(friend._id),
			friendName: friend.friendName,
		},
		ruleset: {
			rulesetId: String(ruleset._id),
			rulesetName: ruleset.rulesetName,
			rules: Array.isArray(ruleset.rules) ? ruleset.rules : [],
		},
		selection: {
			selectionFrozen: Boolean(selection.isFrozen),
			userPlayers,
			friendPlayers,
			userCaptain,
			friendCaptain,
		},
		teams: {
			USER: user,
			FRIEND: friendTeam,
		},
		totals: {
			userTotalPoints,
			friendTotalPoints,
			totalPoints: userTotalPoints + friendTotalPoints,
		},
	};
};

export default {
	buildDetailedBreakdownForSessionId,
};
