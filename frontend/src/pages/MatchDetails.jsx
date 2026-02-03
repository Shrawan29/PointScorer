import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const formatTeams = (teams) => {
	if (!teams) return '';
	if (typeof teams === 'string') return teams;
	if (Array.isArray(teams)) {
		return teams
			.map((t) => (typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName))
			.filter(Boolean)
			.join(' vs ');
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

export const MatchDetails = () => {
	const { matchId } = useParams();
	const navigate = useNavigate();

	const [match, setMatch] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError('');
			try {
				const [todayRes, upcomingRes] = await Promise.all([
					axiosInstance.get('/api/cricket/matches'),
					axiosInstance.get('/api/cricket/matches/upcoming').catch(() => ({ data: [] })),
				]);
				const list = [...(todayRes.data || []), ...(upcomingRes.data || [])];
				const picked = list.find((m) => String(m?.matchUrl || '').includes(`/${matchId}/`));
				if (!cancelled) setMatch(picked || null);
			} catch (err) {
				if (!cancelled) setError(err?.response?.data?.message || 'Failed to load match details');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		if (matchId) load();
		return () => {
			cancelled = true;
		};
	}, [matchId]);

	const teamsText = useMemo(() => formatTeams(match?.teams), [match]);
	const startTimeText = useMemo(() => formatStartTime(match?.startTime), [match]);

	return (
		<Layout>
			<PageHeader
				title="Match Details"
				subtitle={match?.matchName || ''}
				actions={
					<div className="flex gap-2">
						<Link to="/dashboard">
							<Button variant="secondary">Back</Button>
						</Link>
					</div>
				}
			/>

			{error && <Alert type="error">{error}</Alert>}

			{loading ? (
				<div className="text-xs sm:text-sm text-slate-600">Loading...</div>
			) : !match ? (
				<Card title="Match">
					<div className="text-xs sm:text-sm text-slate-600">Match not found.</div>
				</Card>
			) : (
				<div className="grid gap-3">
					<Card title="Overview">
						<div className="grid gap-2 text-sm">
							<div>
								<span className="text-slate-600">Teams:</span>{' '}
								<span className="text-slate-900 text-xs sm:text-sm break-words">{teamsText || '—'}</span>
							</div>
							<div>
								<span className="text-slate-600">Match type:</span>{' '}
								<span className="text-slate-900 text-xs sm:text-sm">{match?.matchType || '—'}</span>
							</div>
							<div>
								<span className="text-slate-600">Start time:</span>{' '}
								<span className="text-slate-900 text-xs sm:text-sm">{startTimeText}</span>
							</div>
							<div>
								<span className="text-slate-600">Venue:</span>{' '}
								<span className="text-slate-900 text-xs sm:text-sm break-words">{match?.venue || '—'}</span>
							</div>
						</div>
					</Card>

					<div className="flex gap-2">
						<Button onClick={() => navigate(`/select-friend/${matchId}`)} fullWidth>
							Play this Match
						</Button>
					</div>
				</div>
			)}
		</Layout>
	);
};

export default MatchDetails;
