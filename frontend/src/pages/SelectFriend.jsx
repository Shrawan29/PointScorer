import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FriendCard from '../components/FriendCard.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RuleSetSelector from '../components/RuleSetSelector.jsx';

export const SelectFriend = () => {
	const { matchId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();

	const [match, setMatch] = useState(null);
	const [friends, setFriends] = useState([]);
	const [rulesets, setRulesets] = useState([]);

	const [selectedFriendId, setSelectedFriendId] = useState('');
	const [selectedRulesetId, setSelectedRulesetId] = useState('');

	const [loading, setLoading] = useState(false);
	const [loadingRulesets, setLoadingRulesets] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState('');

	// Prefer match data coming from navigation state (dashboard list)
	useEffect(() => {
		const candidate = location?.state?.match || null;
		if (candidate && !match) {
			setMatch(candidate);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location?.state?.match]);

	const canCreate = useMemo(
		() => Boolean(matchId && selectedFriendId && selectedRulesetId),
		[matchId, selectedFriendId, selectedRulesetId]
	);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError('');
			try {
				const friendsRes = await axiosInstance.get('/api/friends');
				if (!cancelled) setFriends(friendsRes.data || []);

				// If we already have match data from navigation, don't re-fetch.
				if (!matchId || location?.state?.match) return;

				// Fallback: look up match from Cricbuzz lists.
				const [todayRes, upcomingRes] = await Promise.all([
					axiosInstance.get('/api/cricket/matches'),
					axiosInstance.get('/api/cricket/matches/upcoming').catch(() => ({ data: [] })),
				]);

				const list = [...(todayRes.data || []), ...(upcomingRes.data || [])];
				const picked = list.find((m) => String(m?.matchUrl || '').includes(`/${matchId}/`));
				if (!cancelled) setMatch(picked || null);
			} catch (err) {
				if (!cancelled) setError(err?.response?.data?.message || 'Failed to load data');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		if (matchId) load();
		return () => {
			cancelled = true;
		};
	}, [matchId, location?.state?.match]);

	useEffect(() => {
		let cancelled = false;

		const loadRulesets = async () => {
			if (!selectedFriendId) {
				setRulesets([]);
				setSelectedRulesetId('');
				return;
			}

			setLoadingRulesets(true);
			setError('');
			try {
				const res = await axiosInstance.get(`/api/rulesets/friend/${selectedFriendId}`);
				if (!cancelled) {
					const list = res.data || [];
					setRulesets(list);
					setSelectedRulesetId('');
				}
			} catch (err) {
				if (!cancelled) setError(err?.response?.data?.message || 'Failed to load rulesets');
				if (!cancelled) {
					setRulesets([]);
					setSelectedRulesetId('');
				}
			} finally {
				if (!cancelled) setLoadingRulesets(false);
			}
		};

		loadRulesets();
		return () => {
			cancelled = true;
		};
	}, [selectedFriendId]);

	const onCreate = async () => {
		if (!canCreate) return;
		setCreating(true);
		setError('');

		try {
			const res = await axiosInstance.post('/api/matches', {
				friendId: selectedFriendId,
				rulesetId: selectedRulesetId,
				realMatchId: String(matchId),
				realMatchName: match?.matchName || 'Match',
			});

			const sessionId = res?.data?._id;
			if (!sessionId) {
				setError('Session created but no sessionId returned');
				return;
			}

			navigate(`/player-selection/${sessionId}`, { replace: true });
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to create match session');
		} finally {
			setCreating(false);
		}
	};

	return (
		<Layout>
			<PageHeader
				title="Play with a Friend"
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
				<div className="text-sm text-slate-600">Loading...</div>
			) : (
				<div className="grid gap-4">
					<Card title="Select a friend">
						{friends.length === 0 ? (
							<div className="text-sm text-slate-600">
								No friends yet. <Link className="underline" to="/friends">Create one</Link>.
							</div>
						) : (
							<div className="grid gap-3 sm:grid-cols-2">
								{friends.map((f) => (
									<FriendCard
										key={f._id}
										friend={f}
										selected={selectedFriendId === f._id}
										onSelect={() => setSelectedFriendId(f._id)}
									/>
								))}
							</div>
						)}
					</Card>

					<Card title="Select ruleset">
						{!selectedFriendId ? (
							<div className="text-sm text-slate-600">Select a friend to load rulesets.</div>
						) : loadingRulesets ? (
							<div className="text-sm text-slate-600">Loading rulesets...</div>
						) : rulesets.length === 0 ? (
							<div className="text-sm text-slate-600">
								No rulesets for this friend.{' '}
								<Link className="underline" to={`/friends/${selectedFriendId}/rulesets/new`}>
									Create one
								</Link>
								.
							</div>
						) : (
							<RuleSetSelector
								rulesets={rulesets}
								value={selectedRulesetId}
								onChange={setSelectedRulesetId}
							/>
						)}
					</Card>

					<div className="flex flex-col sm:flex-row gap-2">
						<Button onClick={onCreate} disabled={!canCreate || creating}>
							{creating ? 'Creating session...' : 'Confirm & Start'}
						</Button>
						<Link to="/dashboard">
							<Button variant="secondary">Cancel</Button>
						</Link>
					</div>
				</div>
			)}
		</Layout>
	);
};

export default SelectFriend;
