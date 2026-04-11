import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const FriendsListPage = () => {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canManageFriends = user?.canManageFriends !== false;

  const loadFriends = async () => {
    const res = await axiosInstance.get('/api/friends');
    setFriends(res.data || []);
  };

  useEffect(() => {
    setLoading(true);
    loadFriends().catch((err) => setError(err?.response?.data?.message || 'Failed to load friends')).finally(() => setLoading(false));
  }, []);

  const onAdd = async () => {
    if (!canManageFriends) return;
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
    if (!canManageFriends) return;
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
      <PageHeader
        title="Friends"
        subtitle={canManageFriends ? 'Create and manage friends.' : 'All friends linked to your account are listed here.'}
      />

      {error && <Alert type="error">{error}</Alert>}
      {!canManageFriends && (
        <div className="sticky top-[88px] z-40 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs sm:text-sm text-amber-800 shadow-sm">
          Your account can join linked live rooms, but cannot create or delete friends.
        </div>
      )}

      <div className="grid gap-4">
        {canManageFriends ? (
          <Card title="Add Friend">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <FormField label="Friend name" value={friendName} onChange={setFriendName} disabled={!canManageFriends} />
              </div>
              <div>
                <Button onClick={onAdd} disabled={!canManageFriends}>Add</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card title={canManageFriends ? 'Your Friends' : 'Connected Friends'}>
          {loading ? (
            <div className="text-sm text-slate-600">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="text-sm text-slate-600">
              {canManageFriends ? 'No friends yet.' : 'No connected friends yet.'}
            </div>
          ) : (
            <div className="grid gap-2.5">
              {friends.map((f) => (
                <div
                  key={f._id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{f.friendName}</div>
                    {String(f?.relationType || '') === 'GUEST_VIEW' ? (
                      <div className="text-xs text-slate-500">
                        Connected user: {f?.hostDisplayName || 'User'}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">Direct friend</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/friends/${f._id}`}>
                      <Button variant="secondary">Open</Button>
                    </Link>
                    {canManageFriends && f?.canDelete !== false ? (
                      <Button variant="danger" onClick={() => onDelete(f._id)} disabled={!canManageFriends}>
                        Delete
                      </Button>
                    ) : null}
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
