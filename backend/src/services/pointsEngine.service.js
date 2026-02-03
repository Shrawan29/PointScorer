const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const computeCountEventPoints = (count, rule) => {
	const pointsPerUnit = toNumber(rule?.points);
	const multiplier = typeof rule?.multiplier === 'number' ? rule.multiplier : 1;
	return toNumber(count) * pointsPerUnit * multiplier;
};

const computeMilestonePoints = (conditionMet, rule) => {
	if (!conditionMet) return 0;
	const points = toNumber(rule?.points);
	const multiplier = typeof rule?.multiplier === 'number' ? rule.multiplier : 1;
	return points * multiplier;
};

/**
 * Calculates points for ONE player.
 * @param {object} rawPlayerStats
 * @param {Array<{event: string, points?: number, multiplier?: number, enabled?: boolean}>} rules
 * @param {boolean} isCaptain
 * @returns {{ totalPoints: number, ruleWiseBreakdown: object }}
 */
export const calculatePlayerPoints = (rawPlayerStats, rules, isCaptain) => {
	const safeRules = Array.isArray(rules) ? rules : [];
	const stats = rawPlayerStats || {};

	const runs = toNumber(stats.runs);
	const fours = toNumber(stats.fours);
	const sixes = toNumber(stats.sixes);
	const wickets = toNumber(stats.wickets);
	const catches = toNumber(stats.catches);
	const runouts = toNumber(stats.runouts);

	const ruleWiseBreakdown = {};
	let total = 0;
	let captainMultiplierRule = null;

	for (const rule of safeRules) {
		if (!rule || rule.enabled === false) continue;

		const event = rule.event;
		if (!event || typeof event !== 'string') continue;

		let eventPoints = 0;

		switch (event) {
			case 'run':
				eventPoints = computeCountEventPoints(runs, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'four':
				eventPoints = computeCountEventPoints(fours, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'six':
				eventPoints = computeCountEventPoints(sixes, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'wicket':
				eventPoints = computeCountEventPoints(wickets, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'catch':
				eventPoints = computeCountEventPoints(catches, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'runout':
				eventPoints = computeCountEventPoints(runouts, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;

			// Milestones derived internally
			case 'fifty':
				eventPoints = computeMilestonePoints(runs >= 50, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'hundred':
				eventPoints = computeMilestonePoints(runs >= 100, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'threeWicket':
				eventPoints = computeMilestonePoints(wickets >= 3, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;
			case 'fiveWicket':
				eventPoints = computeMilestonePoints(wickets >= 5, rule);
				ruleWiseBreakdown[event] = eventPoints;
				total += eventPoints;
				break;

			// Applied at the END
			case 'captainMultiplier':
				captainMultiplierRule = rule;
				break;

			default:
				break;
		}
	}

	const beforeCaptain = total;
	if (isCaptain && captainMultiplierRule && captainMultiplierRule.enabled !== false) {
		const multiplier =
			typeof captainMultiplierRule.multiplier === 'number'
				? captainMultiplierRule.multiplier
				: 1;

		total = beforeCaptain * multiplier;
		ruleWiseBreakdown.captainMultiplier = {
			multiplier,
			before: beforeCaptain,
			after: total,
		};
	}

	return {
		totalPoints: total,
		ruleWiseBreakdown,
	};
};

export default calculatePlayerPoints;
