import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

export const FriendPublicHomePage = () => {
	const { token } = useParams();

	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const sessions = useMemo(() => (Array.isArray(data?.sessions) ? data.sessions : []), [data]);

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
						{sessions.length === 0 ? (
							<div className="text-sm text-slate-600">No match history found.</div>
						) : (
							<div className="grid gap-2">
								{sessions.map((s) => (
									<div key={s._id} className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white">
										<div>
											<div className="font-medium text-slate-900">{s.realMatchName}</div>
											<div className="text-xs text-slate-500">
												Status: {s.status}
												{s.playedAt ? ` • Played: ${new Date(s.playedAt).toLocaleString()}` : ''}
											</div>
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
								))}
							</div>
						)}
					</Card>
				)}
			</div>
		</div>
	);
};

export default FriendPublicHomePage;
