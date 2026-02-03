import React from 'react';
import { Link } from 'react-router-dom';

import Button from './Button.jsx';
import MatchCard from './MatchCard.jsx';

export const MatchList = ({ matches }) => {
	const safeMatches = Array.isArray(matches) ? matches : [];

	if (safeMatches.length === 0) {
		return <div className="text-sm text-slate-600">No matches found.</div>;
	}

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{safeMatches.map((m) => {
				const key = m?.matchId || m?.matchUrl || `${m?.matchName}-${m?.startTime}`;
				const matchId = m?.matchId;
				const matchUrl = m?.matchUrl;
				const playTo = matchId ? `/select-friend/${matchId}` : '/dashboard';

				return (
					<div key={key} className="grid gap-2">
						<Link
							to={playTo}
							state={{ match: m }}
							className="block"
						>
							<MatchCard match={m} />
						</Link>

						<div className="flex gap-2">
							<Link to={playTo} state={{ match: m }}>
								<Button>Play with Friend</Button>
							</Link>
							{matchUrl ? (
								<a href={matchUrl} target="_blank" rel="noreferrer">
									<Button variant="secondary">Open Cricbuzz</Button>
								</a>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
};

export default MatchList;
