import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Button from './Button.jsx';
import MatchCard from './MatchCard.jsx';

export const MatchList = ({ matches, pageSize = 10 }) => {
	const safeMatches = Array.isArray(matches) ? matches : [];
	const [visibleCount, setVisibleCount] = useState(pageSize);

	useEffect(() => {
		setVisibleCount(pageSize);
	}, [pageSize, matches]);

	const visibleMatches = useMemo(
		() => safeMatches.slice(0, visibleCount),
		[safeMatches, visibleCount],
	);

	if (safeMatches.length === 0) {
		return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No matches found.</div>;
	}

	return (
		<div className="space-y-3.5">
			{visibleMatches.map((m) => {
				const key = m?.matchId || m?.matchUrl || `${m?.matchName}-${m?.startTime}`;
				const matchId = m?.matchId;
				const matchUrl = m?.matchUrl;
				const playTo = matchId ? `/select-friend/${matchId}` : '/dashboard';

				return (
					<div
						key={key}
						className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4"
					>
						<Link
							to={playTo}
							state={{ match: m }}
							className="block mb-3 hover:no-underline"
						>
							<MatchCard match={m} />
						</Link>

						<div className="flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row">
							<Link to={playTo} state={{ match: m }} className="flex-1 min-w-0">
								<Button fullWidth>Play with Friend</Button>
							</Link>
							{matchUrl ? (
								<a href={matchUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0">
									<Button variant="secondary" fullWidth>Open Cricbuzz</Button>
								</a>
							) : null}
						</div>
					</div>
				);
			})}
			{safeMatches.length > visibleCount ? (
				<button
					type="button"
					onClick={() => setVisibleCount((prev) => prev + pageSize)}
					className="w-full min-h-9 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
				>
					Show more
				</button>
			) : null}
		</div>
	);
};

export default MatchList;
