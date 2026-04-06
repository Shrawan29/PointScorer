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
	if (s === 'TODAY' || s === 'LIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
	if (s === 'UPCOMING') return 'border-sky-200 bg-sky-50 text-sky-700';
	return 'border-slate-200 bg-slate-100 text-slate-700';
};

export const MatchCard = ({ match }) => {
	const matchName = match?.matchName || 'Match';
	const teamsText = formatTeams(match?.teams);
	const matchType = match?.matchType ? String(match.matchType).toUpperCase() : '—';
	const matchStatus = match?.matchStatus || '—';
	const startTime = formatStartTime(match?.startTime);

	return (
		<div className="space-y-2">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="font-display text-[15px] sm:text-base font-bold tracking-tight leading-snug break-words text-slate-900">
						{matchName}
					</div>
					<div className="mt-1 text-xs sm:text-sm leading-snug break-words text-slate-600">
						{teamsText || '—'}
					</div>
				</div>
				<div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide border ${statusBadgeClass(matchStatus)}`}>
					{String(matchStatus).toUpperCase()}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
					Format: {matchType}
				</span>
				<span className="text-xs text-slate-500">Start: {startTime}</span>
			</div>
		</div>
	);
};

export default MatchCard;
