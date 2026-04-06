import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import DashboardMatches from './Dashboard.jsx';

export const DashboardPage = () => {
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadFriends = async () => {
    const res = await axiosInstance.get('/api/friends');
    setFriends(res.data || []);
  };

  useEffect(() => {
    setError('');
    setLoading(true);
    loadFriends()
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load friends'))
      .finally(() => setLoading(false));
  }, []);

  const onAddFriend = async () => {
    if (!friendName.trim()) return;
    setError('');
    try {
      await axiosInstance.post('/api/friends', { friendName });
      setFriendName('');
      await loadFriends();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to add friend');
    }
  };

  return (
    <Layout>
      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-3">
        <DashboardMatches />

        <Card title="Add Friend">
          <div className="flex flex-col gap-2.5">
            <FormField
              label="Friend name"
              value={friendName}
              onChange={setFriendName}
              placeholder="Enter a name"
            />
            <Button onClick={onAddFriend} fullWidth>Add</Button>
          </div>
        </Card>

        <Card title="Friends">
          {loading ? (
            <div className="text-[13px] text-slate-500">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="text-[13px] text-slate-500">No friends yet.</div>
          ) : (
            <div className="grid gap-2">
              {friends.map((f) => (
                <div
                  key={f._id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-slate-900">{f.friendName}</div>
                    <div className="text-[11px] text-slate-400 break-all">{f._id}</div>
                  </div>
                  <Link to={`/friends/${f._id}`}>
                    <Button variant="secondary">Open</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Scoring Rules">
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] text-slate-500">
              Create reusable ruleset templates for scoring.
            </p>
            <Link to="/rulesets/new-template">
              <Button fullWidth>Create Rule Template</Button>
            </Link>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default DashboardPage;