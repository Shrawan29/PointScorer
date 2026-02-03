import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { copyToClipboard } from '../utils/copyToClipboard.js';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const formatLine = (line) => {
	if (!line) return '';
	const label = line.label || line.event || 'Rule';
	const formula = typeof line.formula === 'string' && line.formula ? line.formula : null;
	const points = toNumber(line.points);
	return formula ? `${label}: ${formula}` : `${label}: ${points}`;
};

export const BreakdownPage = () => {
	const { sessionId } = useParams();
	const { user } = useAuth();

	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');
	const [loading, setLoading] = useState(false);
	const [copying, setCopying] = useState(false);
	const [expanded, setExpanded] = useState(() => new Set());

	const matchName = useMemo(
		() => data?.match?.realMatchName || data?.match?.realMatchId || '',
		[data]
	);

	const userPlayers = useMemo(() => (Array.isArray(data?.teams?.USER) ? data.teams.USER : []), [data]);
	const friendPlayers = useMemo(
		() => (Array.isArray(data?.teams?.FRIEND) ? data.teams.FRIEND : []),
		[data]
	);

	const totals = useMemo(
		() => ({
			user: toNumber(data?.totals?.userTotalPoints),
			friend: toNumber(data?.totals?.friendTotalPoints),
			total: toNumber(data?.totals?.totalPoints),
		}),
		[data]
	);

	const userDisplayName = useMemo(() => user?.name || user?.email || 'My', [user]);
	const friendDisplayName = useMemo(
		() => data?.friend?.friendName || data?.friendName || 'Friend',
		[data]
	);

	useEffect(() => {
		const run = async () => {
			setError('');
			setInfo('');
			setLoading(true);
			try {
				const res = await axiosInstance.get(`/api/scoring/session/${sessionId}/breakdown?t=${Date.now()}`);
				setData(res.data);
			} catch (err) {
				setError(err?.response?.data?.message || 'Failed to load breakdown');
			} finally {
				setLoading(false);
			}
		};

		run();
	}, [sessionId]);

	const toggleExpanded = (team, playerId) => {
		const key = `${team}:${String(playerId)}`;
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const onCopyWhatsAppBreakdown = async () => {
		setError('');
		setInfo('');
		setCopying(true);
		try {
			const res = await axiosInstance.get(`/api/share/whatsapp-breakdown/${sessionId}`);
			const text = res.data?.text || '';
			if (!text) {
				setError('No share text available');
				return;
			}
			await copyToClipboard(text);
			setInfo('Copied WhatsApp breakdown text');
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to copy share text');
		} finally {
			setCopying(false);
		}
	};

	const TeamSection = ({ title, teamKey, players }) => {
		return (
			<Card
				title={title}
				actions={
					<div className="text-sm text-slate-600">
						{players.length} player{players.length === 1 ? '' : 's'}
					</div>
				}
			>
				{players.length === 0 ? (
					<div className="text-sm text-slate-600">No players found.</div>
				) : (
					<div className="grid gap-2">
						{players
							.slice()
							.sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
							.map((p) => {
								const key = `${teamKey}:${String(p?.playerId)}`;
								const isOpen = expanded.has(key);
								return (
									<div key={key} className="border rounded-md">
										<button
											type="button"
											onClick={() => toggleExpanded(teamKey, p?.playerId)}
											className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50"
										>
											<div className="font-medium text-slate-900">
												{p?.playerId || 'Unknown'}
												{p?.isCaptain ? (
													<span className="text-xs text-slate-600"> (Captain)</span>
												) : null}
											</div>
											<div className="flex items-center gap-3">
												<div className="font-semibold text-slate-800">{toNumber(p?.totalPoints)}</div>
												<div className="text-xs text-slate-500">{isOpen ? 'Hide' : 'Show'}</div>
											</div>
										</button>

										{isOpen ? (
											<div className="px-3 pb-3">
												<div className="text-xs text-slate-600 mt-1">
													Runs: {toNumber(p?.stats?.runs)} • Fours: {toNumber(p?.stats?.fours)} • Sixes:{' '}
													{toNumber(p?.stats?.sixes)} • Wkts: {toNumber(p?.stats?.wickets)} • Catches:{' '}
													{toNumber(p?.stats?.catches)} • Runouts: {toNumber(p?.stats?.runouts)}
												</div>

												<div className="mt-2 text-sm text-slate-700">
													<div className="font-medium text-slate-900">Formula</div>
													<div className="mt-1 grid gap-1">
														{Array.isArray(p?.lines) && p.lines.length > 0 ? (
															p.lines.map((l, idx) => (
																<div key={`${key}:line:${idx}`} className="font-mono text-xs text-slate-700">
																	{formatLine(l)}
																</div>
															))
														) : (
															<div className="text-xs text-slate-500">No rule lines found.</div>
														)}
													</div>
												</div>

												<div className="mt-2 text-sm text-slate-700">
													Subtotal: {toNumber(p?.subtotal)} • Total: {toNumber(p?.totalPoints)}
												</div>
											</div>
										) : null}
									</div>
								);
							})}
					</div>
				)}
			</Card>
		);
	};

	return (
		<Layout>
			<PageHeader
				title="Points Breakdown"
				subtitle={matchName}
				actions={
					<div className="flex gap-2">
						<Link to={`/sessions/${sessionId}/result`}>
							<Button variant="secondary">Result</Button>
						</Link>
						<Link to={`/sessions/${sessionId}/selection`}>
							<Button variant="secondary">Selection</Button>
						</Link>
						<Button onClick={onCopyWhatsAppBreakdown} disabled={copying}>
							{copying ? 'Copying…' : 'Copy WhatsApp breakdown'}
						</Button>
					</div>
				}
			/>

			{error && <Alert type="error">{error}</Alert>}
			{info && <Alert type="success">{info}</Alert>}

			{loading ? (
				<div className="text-sm text-slate-600">Loading...</div>
			) : !data ? null : (
				<div className="grid gap-4">
					<Card title="Summary">
						<div className="text-sm text-slate-700">{userDisplayName} points: {totals.user}</div>
						<div className="text-sm text-slate-700">{friendDisplayName} points: {totals.friend}</div>
						<div className="text-sm text-slate-700 mt-1">Total points: {totals.total}</div>

						<div className="text-sm text-slate-600 mt-2">
							Generated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
						</div>
						<div className="text-sm text-slate-600">
							Ruleset: {data?.ruleset?.rulesetName || '—'}
						</div>
					</Card>

					<TeamSection title={`${userDisplayName} Team`} teamKey="USER" players={userPlayers} />
					<TeamSection title={`${friendDisplayName} Team`} teamKey="FRIEND" players={friendPlayers} />
				</div>
			)}
		</Layout>
	);
};

export default BreakdownPage;
