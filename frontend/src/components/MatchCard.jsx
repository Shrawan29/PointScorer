import React from 'react';

const formatTeams = (teams) => {
	if (!teams) return '';
	if (typeof teams === 'string') return teams;
	if (Array.isArray(teams)) {
		const names = teams
			.map((t) => (typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName))
			.filter(Boolean);
		return names.join(' vs ');
	}
	return '';
};

const formatStartTime = (startTime) => {
	if (!startTime) return '—';
	const d = typeof startTime === 'number' ? new Date(startTime) : new Date(String(startTime));
	if (Number.isNaN(d.getTime())) return String(startTime);
	return d.toLocaleString(undefined, {
		weekday: 'short',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const statusBadgeClass = (status) => {
	const s = String(status || '').toUpperCase();
	if (s === 'TODAY' || s === 'LIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
	if (s === 'UPCOMING') return 'bg-sky-50 text-sky-700 border-sky-200';
	return 'bg-slate-50 text-slate-700 border-slate-200';
};

export const MatchCard = ({ match }) => {
	const matchName = match?.matchName || 'Match';
	const teamsText = formatTeams(match?.teams);
	const matchType = match?.matchType ? String(match.matchType).toUpperCase() : '—';
	const matchStatus = match?.matchStatus || '—';
	const startTime = formatStartTime(match?.startTime);

	return (
		<div className="bg-white border rounded-lg p-4 hover:border-slate-300 transition-colors">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="font-semibold text-slate-900 truncate">{matchName}</div>
					<div className="text-sm text-slate-600 mt-1 truncate">{teamsText || '—'}</div>
				</div>
				<div className={`shrink-0 px-2 py-1 rounded-md text-xs border ${statusBadgeClass(matchStatus)}`}>
					{String(matchStatus).toUpperCase()}
				</div>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<span className="px-2 py-1 rounded-md text-xs border bg-slate-50 text-slate-700 border-slate-200">
					{matchType}
				</span>
				<span className="text-xs text-slate-600">Start: {startTime}</span>
			</div>
		</div>
	);
};

export default MatchCard;
