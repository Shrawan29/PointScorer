import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

const toNumber = (value) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const getEffectiveStatus = (session) => {
	const raw = String(session?.status || '').toUpperCase();
	if (raw === 'COMPLETED' || session?.playedAt) return 'COMPLETED';
	if (raw === 'LIVE' || raw === 'TODAY') return 'LIVE';
	if (raw === 'UPCOMING') return 'UPCOMING';
	return raw || 'UPCOMING';
};

const getStatusBadgeClass = (status) => {
	if (status === 'COMPLETED') return 'bg-emerald-100 border-emerald-200 text-emerald-700';
	if (status === 'LIVE') return 'bg-sky-100 border-sky-200 text-sky-700';
	if (status === 'UPCOMING') return 'bg-amber-100 border-amber-200 text-amber-700';
	return 'bg-slate-100 border-slate-200 text-slate-700';
};

const getMatchScoreSummary = (session, ownerLabel, friendLabel) => {
	const ownerPoints = toNumber(session?.userTotalPoints);
	const friendPoints = toNumber(session?.friendTotalPoints);
	const diff = Math.abs(ownerPoints - friendPoints);
	const status = getEffectiveStatus(session);
	const hasAnyScore = ownerPoints !== 0 || friendPoints !== 0;

	if (!hasAnyScore && status !== 'COMPLETED') {
		return {
			ownerPoints,
			friendPoints,
			diff,
			summary: 'No score yet',
		};
	}

	if (ownerPoints === friendPoints) {
		return {
			ownerPoints,
			friendPoints,
			diff,
			summary: status === 'COMPLETED' ? 'Match tied' : 'Scores level',
		};
	}

	const winner = ownerPoints > friendPoints ? ownerLabel : friendLabel;
	return {
		ownerPoints,
		friendPoints,
		diff,
		summary:
			status === 'COMPLETED'
				? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
				: `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`,
	};
};

export const FriendPublicHomePage = () => {
	const { token } = useParams();

	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const sessions = useMemo(() => (Array.isArray(data?.sessions) ? data.sessions : []), [data]);
	const friendName = useMemo(() => data?.friend?.friendName || 'Friend', [data]);
	const ownerName = useMemo(() => data?.ownerName || 'Owner', [data]);
	const friendStats = useMemo(() => {
		const playedSessions = sessions.filter(
			(s) => String(s?.status || '').toUpperCase() === 'COMPLETED' || Boolean(s?.playedAt)
		);
		const pointsSource = playedSessions.length > 0 ? playedSessions : sessions;
		const userPoints = pointsSource.reduce((sum, s) => sum + toNumber(s?.userTotalPoints), 0);
		const friendPoints = pointsSource.reduce((sum, s) => sum + toNumber(s?.friendTotalPoints), 0);

		return {
			matchesPlayed: playedSessions.length,
			userPoints,
			friendPoints,
			difference: Math.abs(userPoints - friendPoints),
		};
	}, [sessions]);

	const leadSummary = useMemo(() => {
		const diff = Math.abs(friendStats.userPoints - friendStats.friendPoints);
		if (diff === 0) return 'Scores level';
		const leader = friendStats.userPoints > friendStats.friendPoints ? ownerName : friendName;
		return `${leader} leading by ${diff} point${diff === 1 ? '' : 's'}`;
	}, [friendStats.userPoints, friendStats.friendPoints, ownerName, friendName]);

	useEffect(() => {
		const run = async () => {
			setError('');
			setLoading(true);
			try {
				const res = await axiosInstance.get(`/api/public/friends/${token}`);
				setData(res.data);
			} catch (err) {
				setError(err?.response?.data?.message || 'Failed to load friend view');
			} finally {
				setLoading(false);
			}
		};

		run();
	}, [token]);

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="max-w-4xl mx-auto px-4 py-6 grid gap-4">
				<div>
					<h1 className="text-2xl font-bold text-slate-900">{data?.friend?.friendName || 'Friend View'}</h1>
					<p className="text-sm text-slate-600 mt-1">
						You can only access match history, result, and breakdown from this link.
					</p>
				</div>

				{error && <Alert type="error">{error}</Alert>}

				{loading ? (
					<div className="text-sm text-slate-600">Loading...</div>
				) : (
					<Card title="Match History">
						<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3">
							<div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Summary</div>
							<div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
								<div className="rounded-md border border-slate-200 bg-white px-2 py-2">
									<div className="text-[11px] text-slate-500">Matches played</div>
									<div className="text-sm font-semibold text-slate-900">{friendStats.matchesPlayed}</div>
								</div>
								<div className="rounded-md border border-slate-200 bg-white px-2 py-2">
									<div className="text-[11px] text-slate-500">{friendName} points</div>
									<div className="text-sm font-semibold text-slate-900">{friendStats.friendPoints}</div>
								</div>
								<div className="rounded-md border border-slate-200 bg-white px-2 py-2">
									<div className="text-[11px] text-slate-500">{ownerName} points</div>
									<div className="text-sm font-semibold text-slate-900">{friendStats.userPoints}</div>
								</div>
								<div className="rounded-md border border-slate-200 bg-white px-2 py-2">
									<div className="text-[11px] text-slate-500">Difference</div>
									<div className="text-sm font-semibold text-slate-900">{leadSummary}</div>
								</div>
							</div>
						</div>

						{sessions.length === 0 ? (
							<div className="text-sm text-slate-600">No match history found.</div>
						) : (
							<div className="grid gap-2">
								{sessions.map((s) => {
									const displayStatus = getEffectiveStatus(s);
									const scoreSummary = getMatchScoreSummary(s, ownerName, friendName);
									return (
										<div key={s._id} className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white">
											<div>
												<div className="font-medium text-slate-900">{s.realMatchName}</div>
												<div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
													<span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${getStatusBadgeClass(displayStatus)}`}>
														{displayStatus}
													</span>
													{s.playedAt ? <span>Played: {new Date(s.playedAt).toLocaleString()}</span> : null}
												</div>
												<div className="text-xs text-slate-700 mt-1">
													{ownerName} points: {scoreSummary.ownerPoints} • {friendName} points: {scoreSummary.friendPoints} • Diff: {scoreSummary.diff}
												</div>
												<div className="text-xs text-slate-600">{scoreSummary.summary}</div>
											</div>
											<div className="flex gap-2">
												<Link to={`/friend-view/${token}/sessions/${s._id}/result`}>
													<Button variant="secondary">Result</Button>
												</Link>
												<Link to={`/friend-view/${token}/sessions/${s._id}/breakdown`}>
													<Button variant="secondary">Breakdown</Button>
												</Link>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</Card>
				)}
			</div>
		</div>
	);
};

export default FriendPublicHomePage;
