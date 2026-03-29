import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const FriendPublicResultPage = () => {
	const { token, sessionId } = useParams();

	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const loadResult = async () => {
		const res = await axiosInstance.get(`/api/public/friends/${token}/sessions/${sessionId}/result`);
		setData(res.data);
	};

	const userRows = useMemo(
		() => (Array.isArray(data?.playerWisePoints) ? data.playerWisePoints.filter((r) => String(r?.team || 'USER') === 'USER') : []),
		[data]
	);
	const friendRows = useMemo(
		() => (Array.isArray(data?.playerWisePoints) ? data.playerWisePoints.filter((r) => String(r?.team || 'USER') === 'FRIEND') : []),
		[data]
	);

	const winnerSummary = useMemo(() => {
		const userPoints = toNumber(data?.userTotalPoints);
		const friendPoints = toNumber(data?.friendTotalPoints);
		const diff = Math.abs(userPoints - friendPoints);
		const isCompleted = data?.match?.status === 'COMPLETED' || data?.matchState === 'COMPLETED';

		if (userPoints === friendPoints) return isCompleted ? 'Match tied' : 'Scores level';

		const ownerName = data?.ownerName || 'Owner';
		const friendName = data?.friendName || 'Friend';
		const winner = userPoints > friendPoints ? ownerName : friendName;
		return isCompleted
			? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
			: `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`;
	}, [data]);

	useEffect(() => {
		const run = async () => {
			setError('');
			setInfo('');
			setLoading(true);
			try {
				await loadResult();
			} catch (err) {
				setError(err?.response?.data?.message || 'Failed to load result');
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
			await loadResult();
			setInfo('Stats refreshed and points recalculated');
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to refresh stats');
		} finally {
			setRefreshing(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="max-w-4xl mx-auto px-4 py-6 grid gap-4">
				<div className="flex items-center justify-between gap-2">
					<div>
						<h1 className="text-2xl font-bold text-slate-900">Match Result</h1>
						<p className="text-sm text-slate-600">{data?.match?.realMatchName || ''}</p>
					</div>
					<div className="flex gap-2">
						<Link to={`/friend-view/${token}`}>
							<Button variant="secondary">History</Button>
						</Link>
						<Link to={`/friend-view/${token}/sessions/${sessionId}/breakdown`}>
							<Button variant="secondary">Breakdown</Button>
						</Link>
					</div>
				</div>

				{error && <Alert type="error">{error}</Alert>}
				{info && <Alert type="success">{info}</Alert>}

				{loading ? (
					<div className="text-sm text-slate-600">Loading...</div>
				) : !data ? null : (
					<div className="grid gap-3">
						<Card title="Summary">
							<div className="text-sm text-slate-700">{data?.ownerName || 'Owner'} points: {toNumber(data?.userTotalPoints)}</div>
							<div className="text-sm text-slate-700">{data?.friendName || 'Friend'} points: {toNumber(data?.friendTotalPoints)}</div>
							<div className="text-sm text-slate-700 mt-1">Result: {winnerSummary}</div>
							<div className="mt-3">
								<Button onClick={onRefreshRecalculate} disabled={refreshing} fullWidth>
									{refreshing ? 'Refreshing...' : 'Refresh stats & recalc'}
								</Button>
							</div>
						</Card>

						<Card title={`${data?.ownerName || 'Owner'} player points`}>
							{userRows.length === 0 ? (
								<div className="text-sm text-slate-600">No points found.</div>
							) : (
								<div className="grid gap-2">
									{userRows
										.slice()
										.sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
										.map((r) => (
											<div key={r._id || `${r.team}:${r.playerId}`} className="flex items-center justify-between text-sm">
												<div className="font-medium text-slate-900">{r.playerId}</div>
												<div className="font-semibold text-slate-700">{toNumber(r.totalPoints)}</div>
											</div>
										))}
								</div>
							)}
						</Card>

						<Card title={`${data?.friendName || 'Friend'} player points`}>
							{friendRows.length === 0 ? (
								<div className="text-sm text-slate-600">No points found.</div>
							) : (
								<div className="grid gap-2">
									{friendRows
										.slice()
										.sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
										.map((r) => (
											<div key={r._id || `${r.team}:${r.playerId}`} className="flex items-center justify-between text-sm">
												<div className="font-medium text-slate-900">{r.playerId}</div>
												<div className="font-semibold text-slate-700">{toNumber(r.totalPoints)}</div>
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

export default FriendPublicResultPage;
