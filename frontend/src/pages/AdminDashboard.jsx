import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';
import Alert from '../components/Alert';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';

const ITEMS_PER_PAGE = 10;

// Validation utilities
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return '';
};

const validateName = (name) => {
  if (!name || name.trim().length < 2) return 'Name must be at least 2 characters';
  if (name.trim().length > 100) return 'Name must not exceed 100 characters';
  return '';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [blockingUserId, setBlockingUserId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    isAdmin: false,
    maxFriendsAllowed: 10,
  });

  const [formErrors, setFormErrors] = useState({});

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

  // Filter and paginate users
  const filteredUsers = useMemo(() => {
    return users.filter(u =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  const validateForm = useCallback(() => {
    const errors = {};

    const nameError = validateName(formData.name);
    if (nameError) errors.name = nameError;

    if (!validateEmail(formData.email)) {
      errors.email = 'Invalid email format';
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError) errors.password = passwordError;

    if (isNaN(parseInt(formData.maxFriendsAllowed)) || parseInt(formData.maxFriendsAllowed) < 1 || parseInt(formData.maxFriendsAllowed) > 100) {
      errors.maxFriendsAllowed = 'Max friends must be between 1 and 100';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');
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
      setFormErrors({});
      setShowCreateUser(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBlock = async (userId, currentBlockStatus) => {
    try {
      setBlockingUserId(userId);
      const response = await axiosInstance.patch(`/admin/users/${userId}/toggle-block`);
      setSuccess(response.data.message);
      setUsers(users.map(u => u._id === userId ? response.data.user : u));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
    } finally {
      setBlockingUserId(null);
    }
  };

  const handleUpdateMaxFriends = async (userId) => {
    const userToUpdate = users.find(u => u._id === userId);
    const newMax = prompt(`Enter max friends for ${userToUpdate.name}:`, userToUpdate.maxFriendsAllowed);

    if (newMax === null) return;

    if (isNaN(newMax) || parseInt(newMax) < 1 || parseInt(newMax) > 100) {
      setError('Please enter a valid number between 1 and 100');
      setTimeout(() => setError(''), 3000);
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
    const userToDelete = users.find(u => u._id === userId);

    // Prevent deleting self
    if (userId === user?._id) {
      setError('You cannot delete your own account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${userToDelete.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingUserId(userId);
      await axiosInstance.delete(`/admin/users/${userId}`);
      setSuccess('User deleted successfully');
      setUsers(users.filter(u => u._id !== userId));
      setCurrentPage(1);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
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
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}
        {success && (
          <Alert
            type="success"
            onClose={() => setSuccess('')}
          >
            {success}
          </Alert>
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
            <form onSubmit={handleCreateUser} className="bg-slate-700 p-4 rounded-lg mb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    placeholder="Name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                    }}
                    className={`w-full bg-slate-600 text-white px-3 py-2 rounded border focus:outline-none focus:border-blue-500 ${
                      formErrors.name ? 'border-red-500' : 'border-slate-500'
                    }`}
                  />
                  {formErrors.name && <p className="text-red-400 text-sm mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                    }}
                    className={`w-full bg-slate-600 text-white px-3 py-2 rounded border focus:outline-none focus:border-blue-500 ${
                      formErrors.email ? 'border-red-500' : 'border-slate-500'
                    }`}
                  />
                  {formErrors.email && <p className="text-red-400 text-sm mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <input
                    type="password"
                    placeholder="Password (8+ chars, uppercase, lowercase, number)"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
                    }}
                    className={`w-full bg-slate-600 text-white px-3 py-2 rounded border focus:outline-none focus:border-blue-500 ${
                      formErrors.password ? 'border-red-500' : 'border-slate-500'
                    }`}
                  />
                  {formErrors.password && <p className="text-red-400 text-sm mt-1">{formErrors.password}</p>}
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Max Friends (1-100)"
                    value={formData.maxFriendsAllowed}
                    onChange={(e) => {
                      setFormData({ ...formData, maxFriendsAllowed: e.target.value });
                      if (formErrors.maxFriendsAllowed) setFormErrors({ ...formErrors, maxFriendsAllowed: '' });
                    }}
                    className={`w-full bg-slate-600 text-white px-3 py-2 rounded border focus:outline-none focus:border-blue-500 ${
                      formErrors.maxFriendsAllowed ? 'border-red-500' : 'border-slate-500'
                    }`}
                  />
                  {formErrors.maxFriendsAllowed && <p className="text-red-400 text-sm mt-1">{formErrors.maxFriendsAllowed}</p>}
                </div>
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
                disabled={submitting}
                className="mt-4 bg-green-600 hover:bg-green-700 w-full disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create User'}
              </Button>
            </form>
          )}
        </Card>

        {/* Users List */}
        <Card>
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-white mb-4">All Users ({filteredUsers.length})</h2>
            
            {users.length > 0 && (
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No users found</div>
          ) : paginatedUsers.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No users match your search</div>
          ) : (
            <>
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
                    {paginatedUsers.map((u) => (
                      <tr key={u._id} className="border-b border-slate-600 hover:bg-slate-700 transition">
                        <td className="px-4 py-2 font-semibold">{u.name}</td>
                        <td className="px-4 py-2 text-sm">{u.email}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleUpdateMaxFriends(u._id)}
                            className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                          >
                            {u.maxFriendsAllowed}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {u.isAdmin ? (
                            <span className="bg-purple-600 px-2 py-1 rounded text-xs font-semibold">Admin</span>
                          ) : (
                            <span className="bg-slate-600 px-2 py-1 rounded text-xs">User</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {u.isBlocked ? (
                            <span className="bg-red-600 px-2 py-1 rounded text-xs font-semibold">Blocked</span>
                          ) : (
                            <span className="bg-green-600 px-2 py-1 rounded text-xs font-semibold">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center space-x-2">
                          <button
                            onClick={() => handleToggleBlock(u._id, u.isBlocked)}
                            disabled={blockingUserId === u._id}
                            className={`px-2 py-1 rounded text-white text-xs font-semibold transition disabled:opacity-50 ${
                              u.isBlocked
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {blockingUserId === u._id ? '...' : u.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u._id)}
                            disabled={deletingUserId === u._id}
                            className="px-2 py-1 rounded text-white text-xs font-semibold bg-red-700 hover:bg-red-800 transition disabled:opacity-50"
                          >
                            {deletingUserId === u._id ? '...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-between items-center">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded bg-slate-600 text-white text-sm disabled:opacity-50 hover:bg-slate-500"
                  >
                    Previous
                  </button>
                  <span className="text-slate-300 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded bg-slate-600 text-white text-sm disabled:opacity-50 hover:bg-slate-500"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
