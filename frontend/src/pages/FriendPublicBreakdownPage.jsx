import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const formatLine = (line) => {
	if (!line) return '';
	const label = line.label || line.event || 'Rule';
	const formula = typeof line.formula === 'string' && line.formula ? line.formula : null;
	const points = toNumber(line.points);
	return formula ? `${label}: ${formula}` : `${label}: ${points}`;
};

export const FriendPublicBreakdownPage = () => {
	const { token, sessionId } = useParams();

	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const loadBreakdown = async () => {
		const res = await axiosInstance.get(`/api/public/friends/${token}/sessions/${sessionId}/breakdown`);
		setData(res.data);
	};

	const userPlayers = useMemo(() => (Array.isArray(data?.teams?.USER) ? data.teams.USER : []), [data]);
	const friendPlayers = useMemo(() => (Array.isArray(data?.teams?.FRIEND) ? data.teams.FRIEND : []), [data]);

	const totals = useMemo(
		() => ({
			user: toNumber(data?.totals?.userTotalPoints),
			friend: toNumber(data?.totals?.friendTotalPoints),
		}),
		[data]
	);

	const winnerSummary = useMemo(() => {
		const diff = Math.abs(totals.user - totals.friend);
		const isCompleted = data?.matchState === 'COMPLETED' || data?.match?.status === 'COMPLETED';

		if (totals.user === totals.friend) return isCompleted ? 'Match tied' : 'Scores level';

		const ownerName = data?.userName || 'Owner';
		const friendName = data?.friend?.friendName || data?.friendName || 'Friend';
		const winner = totals.user > totals.friend ? ownerName : friendName;
		return isCompleted
			? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
			: `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`;
	}, [totals.user, totals.friend, data]);

	useEffect(() => {
		const run = async () => {
			setError('');
			setInfo('');
			setLoading(true);
			try {
				await loadBreakdown();
			} catch (err) {
				setError(err?.response?.data?.message || 'Failed to load breakdown');
			} finally {
				setLoading(false);
			}
		};

		run();
	}, [token, sessionId]);

	const onRefreshRecalculate = async () => {
		setError('');
		setInfo('');
		setRefreshing(true);
		try {
			await axiosInstance.post(`/api/public/friends/${token}/sessions/${sessionId}/refresh`);
			await loadBreakdown();
			setInfo('Stats refreshed and points recalculated');
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to refresh stats');
		} finally {
			setRefreshing(false);
		}
	};

	return (
		<div className="public-shell">
			<div className="public-wrap grid gap-4">
				<div className="flex items-center justify-between gap-2">
					<div>
						<h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Points Breakdown</h1>
						<p className="text-sm text-slate-600">{data?.match?.realMatchName || ''}</p>
					</div>
					<div className="flex gap-2">
						<Link to={`/friend-view/${token}`}>
							<Button variant="secondary">History</Button>
						</Link>
						<Link to={`/friend-view/${token}/sessions/${sessionId}/result`}>
							<Button variant="secondary">Result</Button>
						</Link>
					</div>
				</div>

				{error && <Alert type="error">{error}</Alert>}
				{info && <Alert type="success" floating>{info}</Alert>}

				{loading ? (
					<div className="text-sm text-slate-600">Loading...</div>
				) : !data ? null : (
					<div className="grid gap-4">
						<Card title="Summary">
							<div className="text-sm text-slate-700">Owner points: {totals.user}</div>
							<div className="text-sm text-slate-700">{data?.friend?.friendName || 'Friend'} points: {totals.friend}</div>
							<div className="text-sm text-slate-700 mt-1">Result: {winnerSummary}</div>
							<div className="mt-3">
								<Button onClick={onRefreshRecalculate} disabled={refreshing} fullWidth>
									{refreshing ? 'Refreshing...' : 'Refresh stats & recalc'}
								</Button>
							</div>
						</Card>

						<Card title="Owner Team Breakdown">
							{userPlayers.length === 0 ? (
								<div className="text-sm text-slate-600">No players found.</div>
							) : (
								<div className="grid gap-2.5">
									{userPlayers
										.slice()
										.sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
										.map((p) => (
											<div key={`USER:${String(p?.playerId)}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
												<div className="font-medium text-slate-900">{p?.playerId || 'Unknown'}</div>
												<div className="text-sm text-slate-700 mt-1">Total: {toNumber(p?.totalPoints)}</div>
												<div className="mt-2 grid gap-1">
													{Array.isArray(p?.lines) && p.lines.length > 0 ? (
														p.lines.map((line, idx) => (
															<div key={`USER:${String(p?.playerId)}:${idx}`} className="text-xs font-mono text-slate-700">
																{formatLine(line)}
															</div>
														))
													) : (
														<div className="text-xs text-slate-500">No rule lines found.</div>
													)}
												</div>
											</div>
										))}
								</div>
							)}
						</Card>

						<Card title={`${data?.friend?.friendName || 'Friend'} Team Breakdown`}>
							{friendPlayers.length === 0 ? (
								<div className="text-sm text-slate-600">No players found.</div>
							) : (
								<div className="grid gap-2.5">
									{friendPlayers
										.slice()
										.sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
										.map((p) => (
											<div key={`FRIEND:${String(p?.playerId)}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
												<div className="font-medium text-slate-900">{p?.playerId || 'Unknown'}</div>
												<div className="text-sm text-slate-700 mt-1">Total: {toNumber(p?.totalPoints)}</div>
												<div className="mt-2 grid gap-1">
													{Array.isArray(p?.lines) && p.lines.length > 0 ? (
														p.lines.map((line, idx) => (
															<div key={`FRIEND:${String(p?.playerId)}:${idx}`} className="text-xs font-mono text-slate-700">
																{formatLine(line)}
															</div>
														))
													) : (
														<div className="text-xs text-slate-500">No rule lines found.</div>
													)}
												</div>
											</div>
										))}
								</div>
							)}
						</Card>
					</div>
				)}
			</div>
		</div>
	);
};

export default FriendPublicBreakdownPage;
