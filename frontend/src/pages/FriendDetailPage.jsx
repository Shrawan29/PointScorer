import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { copyToClipboard } from '../utils/copyToClipboard.js';

const formatPlayerPreview = (players, limit = 4) => {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  if (list.length === 0) return 'No players saved';
  if (list.length <= limit) return list.join(', ');
  return `${list.slice(0, limit).join(', ')} +${list.length - limit} more`;
};

export const FriendDetailPage = () => {
  const { friendId } = useParams();
  const location = useLocation();

  const [friend, setFriend] = useState(null);
  const [rulesets, setRulesets] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
	const [deletingId, setDeletingId] = useState('');
	const [copyingLink, setCopyingLink] = useState(false);
  const [friendViewLink, setFriendViewLink] = useState('');

  const friendName = useMemo(() => friend?.friendName || friendId, [friend, friendId]);

  useEffect(() => {
    const run = async () => {
      setError('');
      setFriendViewLink('');
      setLoading(true);
      try {
        const [friendsRes, rulesetsRes, sessionsRes, shareRes] = await Promise.all([
          axiosInstance.get('/api/friends'),
          axiosInstance.get(`/api/rulesets/friend/${friendId}`),
			// Fetch all so we can optionally show pending sessions; UI still hides pending by default.
			// Add a small cache buster to avoid stale data when navigating back after freezing.
          axiosInstance.get(`/api/matches/friend/${friendId}?onlyFrozen=false&_ts=${Date.now()}`),
			axiosInstance.get(`/api/share/friend-view/${friendId}`).catch(() => null),
        ]);

        const friends = friendsRes.data || [];
        setFriend(friends.find((f) => f._id === friendId) || null);
        setRulesets(rulesetsRes.data || []);
			const rawSessions = sessionsRes.data || [];
			setSessions(rawSessions);
			setFriendViewLink(shareRes?.data?.url || '');
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load friend details');
      } finally {
        setLoading(false);
      }
    };

    run();
	// Re-run when navigating away/back so frozen status updates in UI.
  }, [friendId, location.key]);

  const onDeleteSession = async (session) => {
    const sessionId = session?._id;
    if (!sessionId) return;
    const name = session?.realMatchName || 'this match session';
    const ok = window.confirm(`Delete "${name}"? This will remove the session, selections, and results.`);
    if (!ok) return;
    setError('');
    setDeletingId(String(sessionId));
    try {
      await axiosInstance.delete(`/api/matches/session/${sessionId}`);
      setSessions((prev) => (prev || []).filter((s) => String(s?._id) !== String(sessionId)));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete match session');
    } finally {
      setDeletingId('');
    }
  };

  const onCopyFriendViewLink = async () => {
    setError('');
    setInfo('');
    setCopyingLink(true);
    try {
      let url = friendViewLink;
      if (!url) {
        const res = await axiosInstance.get(`/api/share/friend-view/${friendId}`);
        url = res?.data?.url || '';
        if (url) {
          setFriendViewLink(url);
          // iOS Safari can require a strict user gesture for clipboard writes.
          // Fetch the link first, then copy on the next tap without awaiting network.
          setInfo('Link is ready. Tap copy again.');
          return;
        }
      }

      if (!url) {
        setError('Unable to generate friend view link');
        return;
      }

      const copied = await copyToClipboard(url);
      if (!copied) {
        if (navigator?.share) {
          try {
            await navigator.share({
              title: `${friendName} match history`,
              url,
            });
            setInfo('Opened share sheet. Choose Copy or Messages/WhatsApp.');
            return;
          } catch {
            // Ignore cancelled share and fall through to error.
          }
        }
        setError('Copy failed for friend view link. Long-press this link to copy: ' + url);
        return;
      }

      setInfo('Friend view link copied');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to generate friend view link');
    } finally {
      setCopyingLink(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title={friendName}
        subtitle="Rulesets and match sessions for this friend."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCopyFriendViewLink} disabled={copyingLink}>
              {copyingLink ? 'Copying...' : 'Copy friend result link'}
            </Button>
            <Link to={`/friends/${friendId}/rulesets`}>
              <Button variant="secondary">Rulesets</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
			{info && <Alert type="success">{info}</Alert>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading...</div>
      ) : (
        <div className="grid gap-4">
          <Card
            title="Rulesets"
            actions={
              <Link to={`/friends/${friendId}/rulesets/new`}>
                <Button variant="secondary">Create</Button>
              </Link>
            }
          >
            {rulesets.length === 0 ? (
              <div className="text-sm text-slate-600">No rulesets yet.</div>
            ) : (
              <div className="grid gap-2">
                {rulesets.map((r) => (
                  <div key={r._id} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{r.rulesetName}</div>
                      <div className="text-xs text-slate-500">{r._id}</div>
                    </div>
                    <Link to={`/friends/${friendId}/rulesets/${r._id}`}>
                      <Button variant="secondary">Open</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Match Sessions">
      {(() => {
        const frozen = (sessions || []).filter((s) => s.selectionFrozen === true);
        const pending = (sessions || []).filter((s) => s.selectionFrozen === false);

        return (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                Only frozen selections appear by default.
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={showPending}
                  onChange={(e) => setShowPending(e.target.checked)}
                />
                Show pending
              </label>
            </div>

            {frozen.length === 0 ? (
              <div className="text-sm text-slate-600">
                No frozen sessions yet. Create a session, pick players, then click “Freeze” on the Selection page.
              </div>
            ) : (
              <div className="grid gap-2">
                {frozen.map((s) => (
                  <div key={s._id} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{s.realMatchName}</div>
                      <div className="text-xs text-slate-500">
                        Status: {s.status}{' '}
                        {s.playedAt ? `• Played: ${new Date(s.playedAt).toLocaleString()}` : ''}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        My players: {formatPlayerPreview(s.userPlayers)}
                      </div>
                      <div className="text-xs text-slate-600">
                        {friendName} players: {formatPlayerPreview(s.friendPlayers)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/sessions/${s._id}/result`}>
                        <Button variant="secondary">Result</Button>
                      </Link>
						<Button
							variant="danger"
							disabled={deletingId === String(s._id)}
							onClick={() => onDeleteSession(s)}
						>
							{deletingId === String(s._id) ? 'Deleting...' : 'Delete'}
						</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showPending ? (
              <p className="text-xs text-slate-600">
                Pending sessions are not frozen yet. Open Selection to freeze.
              </p>
            ) : null}

            {showPending && pending.length > 0 ? (
              <div className="grid gap-2">
                {pending.map((s) => (
                  <div key={s._id} className="flex items-center justify-between gap-3 opacity-90">
                    <div>
                      <div className="font-medium text-slate-900">{s.realMatchName}</div>
                      <div className="text-xs text-slate-500">Pending (not frozen)</div>
                      <div className="text-xs text-slate-600 mt-1">
                        My players: {formatPlayerPreview(s.userPlayers)}
                      </div>
                      <div className="text-xs text-slate-600">
                        {friendName} players: {formatPlayerPreview(s.friendPlayers)}
                      </div>
                    </div>
                    <div className="flex gap-2">
						<Button
							variant="danger"
							disabled={deletingId === String(s._id)}
							onClick={() => onDeleteSession(s)}
						>
							{deletingId === String(s._id) ? 'Deleting...' : 'Delete'}
						</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}
          </Card>
        </div>
      )}
    </Layout>
  );
};

export default FriendDetailPage;
