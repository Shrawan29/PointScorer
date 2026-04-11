import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const RulesetListPage = () => {
  const { friendId } = useParams();
  const { user } = useAuth();

  const [rulesets, setRulesets] = useState([]);
  const [friendRelationType, setFriendRelationType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const readOnly =
    Boolean(rulesets[0]?.readOnly) ||
    String(friendRelationType || '') === 'GUEST_VIEW';
  const canCreate = user?.canManageFriends !== false && !readOnly;

  useEffect(() => {
    const run = async () => {
      setError('');
      setLoading(true);
      try {
        const [rulesetRes, friendsRes] = await Promise.all([
          axiosInstance.get(`/api/rulesets/friend/${friendId}`),
          axiosInstance.get('/api/friends').catch(() => ({ data: [] })),
        ]);
        setRulesets(rulesetRes.data || []);
        const friends = Array.isArray(friendsRes?.data) ? friendsRes.data : [];
        const friend = friends.find((f) => String(f?._id) === String(friendId));
        setFriendRelationType(String(friend?.relationType || ''));
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load rulesets');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [friendId]);

  return (
    <Layout>
      <PageHeader
        title="Rulesets"
        subtitle={
          readOnly
            ? 'Rulesets attached to this friend. View-only access from your account.'
            : 'Rulesets are attached to a friend and used by sessions.'
        }
        actions={
          <div className="flex gap-2">
            <Link to={`/friends/${friendId}`}>
              <Button variant="secondary">Back</Button>
            </Link>
            {canCreate ? (
              <Link to={`/friends/${friendId}/rulesets/new`}>
                <Button>Create</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card title="List">
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : rulesets.length === 0 ? (
          <div className="text-sm text-slate-600">No rulesets yet.</div>
        ) : (
          <div className="grid gap-2.5">
            {rulesets.map((r) => (
              <div key={r._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div>
                  <div className="font-semibold text-slate-900">{r.rulesetName}</div>
                  <div className="text-xs text-slate-500 break-all">{r._id}</div>
                </div>
                <Link to={`/friends/${friendId}/rulesets/${r._id}`}>
                  <Button variant="secondary">Open</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
};

export default RulesetListPage;
