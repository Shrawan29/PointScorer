import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';
import Alert from '../components/Alert';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    isAdmin: false,
    maxFriendsAllowed: 10,
  });

  // Redirect if not admin
  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Fetch users on mount
  useEffect(() => {
    if (user?.isAdmin) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axiosInstance.get('/admin/users');
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
        setError('All fields are required');
        return;
      }

      const response = await axiosInstance.post('/admin/users/create', formData);
      setSuccess('User created successfully');
      setUsers([response.data.user, ...users]);
      setFormData({
        name: '',
        email: '',
        password: '',
        isAdmin: false,
        maxFriendsAllowed: 10,
      });
      setShowCreateUser(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleToggleBlock = async (userId, currentBlockStatus) => {
    try {
      const response = await axiosInstance.patch(`/admin/users/${userId}/toggle-block`);
      setSuccess(response.data.message);
      setUsers(users.map(u => u._id === userId ? response.data.user : u));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleUpdateMaxFriends = async (userId) => {
    const user = users.find(u => u._id === userId);
    const newMax = prompt(`Enter max friends for ${user.name}:`, user.maxFriendsAllowed);
    
    if (newMax === null) return;

    if (isNaN(newMax) || parseInt(newMax) < 1) {
      setError('Please enter a valid number');
      return;
    }

    try {
      const response = await axiosInstance.put(`/admin/users/${userId}`, {
        maxFriendsAllowed: parseInt(newMax),
      });
      setSuccess('Max friends updated successfully');
      setUsers(users.map(u => u._id === userId ? response.data.user : u));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await axiosInstance.delete(`/admin/users/${userId}`);
      setSuccess('User deleted successfully');
      setUsers(users.filter(u => u._id !== userId));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  if (!user?.isAdmin) {
    return <div className="p-4 text-red-600">Admin access required</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <PageHeader title="Admin Dashboard" />

      <div className="max-w-full mx-auto px-4 py-6">
        {error && (
          <Alert
            type="error"
            message={error}
            onClose={() => setError('')}
          />
        )}
        {success && (
          <Alert
            type="success"
            message={success}
            onClose={() => setSuccess('')}
          />
        )}

        {/* Create User Section */}
        <Card className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">User Management</h2>
            <Button
              onClick={() => setShowCreateUser(!showCreateUser)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {showCreateUser ? 'Cancel' : '+ Create User'}
            </Button>
          </div>

          {showCreateUser && (
            <form onSubmit={handleCreateUser} className="bg-slate-700 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max Friends"
                  value={formData.maxFriendsAllowed}
                  onChange={(e) => setFormData({ ...formData, maxFriendsAllowed: parseInt(e.target.value) })}
                  className="bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-blue-500"
                />
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isAdmin}
                    onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-white">Make Admin</span>
                </label>
              </div>
              <Button
                type="submit"
                className="mt-4 bg-green-600 hover:bg-green-700 w-full"
              >
                Create User
              </Button>
            </form>
          )}
        </Card>

        {/* Users List */}
        <Card>
          <h2 className="text-2xl font-bold text-white mb-4">All Users ({users.length})</h2>
          
          {loading ? (
            <div className="text-center text-gray-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center text-gray-400">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-white text-sm">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-center">Max Friends</th>
                    <th className="px-4 py-2 text-center">Role</th>
                    <th className="px-4 py-2 text-center">Status</th>
                    <th className="px-4 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} className="border-b border-slate-600 hover:bg-slate-700">
                      <td className="px-4 py-2 font-semibold">{u.name}</td>
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => handleUpdateMaxFriends(u._id)}
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {u.maxFriendsAllowed}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {u.isAdmin ? (
                          <span className="bg-purple-600 px-2 py-1 rounded text-xs">Admin</span>
                        ) : (
                          <span className="bg-slate-600 px-2 py-1 rounded text-xs">User</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {u.isBlocked ? (
                          <span className="bg-red-600 px-2 py-1 rounded text-xs">Blocked</span>
                        ) : (
                          <span className="bg-green-600 px-2 py-1 rounded text-xs">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center space-x-2">
                        <button
                          onClick={() => handleToggleBlock(u._id, u.isBlocked)}
                          className={`px-2 py-1 rounded text-white text-xs ${
                            u.isBlocked
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {u.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u._id)}
                          className="px-2 py-1 rounded text-white text-xs bg-red-700 hover:bg-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
