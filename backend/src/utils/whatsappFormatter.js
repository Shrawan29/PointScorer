const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * Generates WhatsApp-ready share text (plain text).
 * @param {object} params
 * @param {object} params.matchSession
 * @param {string} params.friendName
 * @param {string} params.rulesetName
 * @param {object|Array} params.playerSelections
 * @param {Array} params.pointsBreakdowns
 * @returns {string}
 */
export const formatWhatsAppShareText = ({
	matchSession,
	userName,
	friendName,
	rulesetName,
	playerSelections,
	pointsBreakdowns,
}) => {
	const matchName = matchSession?.realMatchName || matchSession?.realMatchId || 'Match';
	const you = userName || 'My';

	const selection = Array.isArray(playerSelections) ? playerSelections[0] : playerSelections;
	const userCaptain = selection?.userCaptain || selection?.captain || 'N/A';
	const friendCaptain = selection?.friendCaptain || 'N/A';

	const rows = Array.isArray(pointsBreakdowns) ? pointsBreakdowns : [];
	const userRows = rows.filter((r) => String(r?.team || 'USER') === 'USER');
	const friendRows = rows.filter((r) => String(r?.team || 'USER') === 'FRIEND');

	const sortedUser = [...userRows].sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints));
	const sortedFriend = [...friendRows].sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints));

	const userTotalPoints = sortedUser.reduce((sum, r) => sum + toNumber(r?.totalPoints), 0);
	const friendTotalPoints = sortedFriend.reduce((sum, r) => sum + toNumber(r?.totalPoints), 0);
	const totalPoints = userTotalPoints + friendTotalPoints;

	const lines = [];
	lines.push(`Match: ${matchName}`);
	lines.push(`You: ${you}`);
	lines.push(`Friend: ${friendName || 'N/A'}`);
	lines.push(`Ruleset: ${rulesetName || 'N/A'}`);
	lines.push(`${you} Captain: ${userCaptain}`);
	lines.push(`${friendName || 'Friend'} Captain: ${friendCaptain}`);
	lines.push('');
	lines.push(`${you} Player Points:`);
	if (sortedUser.length === 0) {
		lines.push('No points available');
	} else {
		sortedUser.forEach((r, idx) => {
			const player = r?.playerId || 'Unknown';
			const pts = toNumber(r?.totalPoints);
			lines.push(`${idx + 1}. ${player} - ${pts}`);
		});
	}

	lines.push('');
	lines.push(`${friendName || 'Friend'} Player Points:`);
	if (sortedFriend.length === 0) {
		lines.push('No points available');
	} else {
		sortedFriend.forEach((r, idx) => {
			const player = r?.playerId || 'Unknown';
			const pts = toNumber(r?.totalPoints);
			lines.push(`${idx + 1}. ${player} - ${pts}`);
		});
	}

	lines.push('');
	lines.push('');
	lines.push(`${you} Points: ${userTotalPoints}`);
	lines.push(`${friendName || 'Friend'} Points: ${friendTotalPoints}`);
	lines.push(`Total Points: ${totalPoints}`);

	return lines.join('\n');
};

/**
 * Generates WhatsApp-ready share text for the detailed per-player breakdown (plain text).
 * @param {object} params
 * @param {object} params.matchSession
 * @param {string} params.friendName
 * @param {string} params.rulesetName
 * @param {object} params.playerSelections
 * @param {object} params.breakdown
 * @returns {string}
 */
export const formatWhatsAppBreakdownShareText = ({
	matchSession,
	userName,
	friendName,
	rulesetName,
	playerSelections,
	breakdown,
}) => {
	const matchName = matchSession?.realMatchName || matchSession?.realMatchId || 'Match';
	const you = userName || 'My';
	const selection = playerSelections || {};
	const userCaptain = selection?.userCaptain || selection?.captain || 'N/A';
	const friendCaptain = selection?.friendCaptain || 'N/A';

	const generatedAt = breakdown?.generatedAt ? new Date(breakdown.generatedAt) : null;
	const userTeam = Array.isArray(breakdown?.teams?.USER) ? breakdown.teams.USER : [];
	const friendTeam = Array.isArray(breakdown?.teams?.FRIEND) ? breakdown.teams.FRIEND : [];

	const userTotalPoints = typeof breakdown?.totals?.userTotalPoints === 'number' ? breakdown.totals.userTotalPoints : 0;
	const friendTotalPoints = typeof breakdown?.totals?.friendTotalPoints === 'number' ? breakdown.totals.friendTotalPoints : 0;
	const totalPoints = typeof breakdown?.totals?.totalPoints === 'number' ? breakdown.totals.totalPoints : userTotalPoints + friendTotalPoints;

	const lines = [];
	lines.push(`Match: ${matchName}`);
	lines.push(`You: ${you}`);
	lines.push(`Friend: ${friendName || 'N/A'}`);
	lines.push(`Ruleset: ${rulesetName || 'N/A'}`);
	lines.push(`${you} Captain: ${userCaptain}`);
	lines.push(`${friendName || 'Friend'} Captain: ${friendCaptain}`);
	if (generatedAt && !Number.isNaN(generatedAt.getTime())) {
		lines.push(`Generated: ${generatedAt.toLocaleString()}`);
	}
	lines.push('');

	const formatTeam = (title, players) => {
		lines.push(title);
		if (!Array.isArray(players) || players.length === 0) {
			lines.push('No players');
			lines.push('');
			return;
		}

		players.forEach((p, idx) => {
			const name = p?.playerId || 'Unknown';
			const total = typeof p?.totalPoints === 'number' ? p.totalPoints : 0;
			const cap = p?.isCaptain ? ' (Captain)' : '';
			lines.push(`${idx + 1}. ${name}${cap} - ${total}`);
			const ruleLines = Array.isArray(p?.lines) ? p.lines : [];
			if (ruleLines.length === 0) {
				lines.push('   (no rules applied)');
				return;
			}
			ruleLines.forEach((l) => {
				const label = l?.label || l?.event || 'Rule';
				const pts = typeof l?.points === 'number' ? l.points : 0;
				const formula = typeof l?.formula === 'string' ? l.formula : '';
				lines.push(`   - ${label}: ${formula}${formula ? '' : pts}`);
			});
		});

		lines.push('');
	};

	formatTeam(`${you} Team Breakdown:`, userTeam);
	formatTeam(`${friendName || 'Friend'} Team Breakdown:`, friendTeam);

	lines.push(`${you} Points: ${userTotalPoints}`);
	lines.push(`${friendName || 'Friend'} Points: ${friendTotalPoints}`);
	lines.push(`Total Points: ${totalPoints}`);

	return lines.join('\n');
};

export default formatWhatsAppShareText;
