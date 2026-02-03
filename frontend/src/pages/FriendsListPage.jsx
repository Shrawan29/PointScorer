import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const FriendsListPage = () => {
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadFriends = async () => {
    const res = await axiosInstance.get('/api/friends');
    setFriends(res.data || []);
  };

  useEffect(() => {
    setLoading(true);
    loadFriends().catch((err) => setError(err?.response?.data?.message || 'Failed to load friends')).finally(() => setLoading(false));
  }, []);

  const onAdd = async () => {
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

  const onDelete = async (friendId) => {
    setError('');
    try {
      await axiosInstance.delete(`/api/friends/${friendId}`);
      await loadFriends();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete friend');
    }
  };

  return (
    <Layout>
      <PageHeader title="Friends" subtitle="Create and manage friends." />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-3">
        <Card title="Add Friend">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1">
              <FormField label="Friend name" value={friendName} onChange={setFriendName} />
            </div>
            <div>
              <Button onClick={onAdd}>Add</Button>
            </div>
          </div>
        </Card>

        <Card title="Your Friends">
          {loading ? (
            <div className="text-sm text-slate-600">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="text-sm text-slate-600">No friends yet.</div>
          ) : (
            <div className="grid gap-2">
              {friends.map((f) => (
                <div key={f._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{f.friendName}</div>
                    <div className="text-xs text-slate-500">{f._id}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/friends/${f._id}`}>
                      <Button variant="secondary">Open</Button>
                    </Link>
                    <Button variant="danger" onClick={() => onDelete(f._id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default FriendsListPage;
