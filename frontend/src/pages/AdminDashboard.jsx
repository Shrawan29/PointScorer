import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';
import Alert from '../components/Alert';
import Button from '../components/Button';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import FormField from '../components/FormField';

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
  const [editingFriendsLimit, setEditingFriendsLimit] = useState(null);
  const [editingFriendsValue, setEditingFriendsValue] = useState('');
  const [resetRequests, setResetRequests] = useState([]);
  const [resetRequestsLoading, setResetRequestsLoading] = useState(false);
  const [resolvingResetId, setResolvingResetId] = useState(null);
  const [tempPasswordByRequestId, setTempPasswordByRequestId] = useState({});
  const [resetNoteByRequestId, setResetNoteByRequestId] = useState({});

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
      fetchResetRequests();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axiosInstance.get('/api/admin/users');
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchResetRequests = async () => {
    try {
      setResetRequestsLoading(true);
      const response = await axiosInstance.get('/api/admin/password-reset-requests?status=PENDING');
      setResetRequests(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch password reset requests');
    } finally {
      setResetRequestsLoading(false);
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
      const response = await axiosInstance.post('/api/admin/users/create', formData);
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
      const response = await axiosInstance.patch(`/api/admin/users/${userId}/toggle-block`);
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
    if (isNaN(editingFriendsValue) || parseInt(editingFriendsValue) < 1 || parseInt(editingFriendsValue) > 100) {
      setError('Please enter a valid number between 1 and 100');
      return;
    }

    try {
      const response = await axiosInstance.put(`/api/admin/users/${userId}`, {
        maxFriendsAllowed: parseInt(editingFriendsValue),
      });
      setSuccess('Max friends updated successfully');
      setUsers(users.map(u => u._id === userId ? response.data.user : u));
      setEditingFriendsLimit(null);
      setEditingFriendsValue('');
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
      await axiosInstance.delete(`/api/admin/users/${userId}`);
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

  const handleSetTemporaryPassword = async (requestId) => {
    const temporaryPassword = String(tempPasswordByRequestId[requestId] || '').trim();
    const note = String(resetNoteByRequestId[requestId] || '').trim();

    if (!temporaryPassword) {
      setError('Temporary password is required');
      return;
    }

    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    try {
      setResolvingResetId(requestId);
      setError('');
      const response = await axiosInstance.post(`/api/admin/password-reset-requests/${requestId}/set-temporary-password`, {
        temporaryPassword,
        resolutionNote: note,
      });
      setSuccess(response?.data?.message || 'Temporary password set successfully');
      setResetRequests((prev) => prev.filter((r) => String(r?._id) !== String(requestId)));
      setTempPasswordByRequestId((prev) => ({ ...prev, [requestId]: '' }));
      setResetNoteByRequestId((prev) => ({ ...prev, [requestId]: '' }));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set temporary password');
    } finally {
      setResolvingResetId(null);
    }
  };

  if (!user?.isAdmin) {
    return (
      <Layout>
        <div className="p-4 text-red-600">Admin access required</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader 
        title="Admin Dashboard" 
        subtitle={`Managing ${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`}
      />

      {error && (
        <Alert type="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert type="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <div className="grid gap-4">
        {/* Create User Section */}
        <Card title="Create New User">
          {!showCreateUser ? (
            <Button onClick={() => setShowCreateUser(true)} className="w-full">
              + Add User
            </Button>
          ) : (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <FormField 
                label="Name" 
                value={formData.name}
                onChange={(v) => {
                  setFormData({ ...formData, name: v });
                  if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                }}
                placeholder="Full name"
              />
              {formErrors.name && <p className="text-red-500 text-sm">{formErrors.name}</p>}

              <FormField 
                label="Email" 
                type="email"
                value={formData.email}
                onChange={(v) => {
                  setFormData({ ...formData, email: v });
                  if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                }}
                placeholder="user@example.com"
              />
              {formErrors.email && <p className="text-red-500 text-sm">{formErrors.email}</p>}

              <FormField 
                label="Password" 
                type="password"
                value={formData.password}
                onChange={(v) => {
                  setFormData({ ...formData, password: v });
                  if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
                }}
                placeholder="Minimum 8 characters with uppercase, lowercase, and number"
              />
              {formErrors.password && <p className="text-red-500 text-sm">{formErrors.password}</p>}

              <FormField 
                label="Max Friends Allowed" 
                type="number"
                value={formData.maxFriendsAllowed}
                onChange={(v) => {
                  setFormData({ ...formData, maxFriendsAllowed: v });
                  if (formErrors.maxFriendsAllowed) setFormErrors({ ...formErrors, maxFriendsAllowed: '' });
                }}
                placeholder="1-100"
              />
              {formErrors.maxFriendsAllowed && <p className="text-red-500 text-sm">{formErrors.maxFriendsAllowed}</p>}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isAdmin}
                  onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-slate-700 font-medium">Make Admin</span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </Button>
                <Button 
                  type="button" 
                  onClick={() => setShowCreateUser(false)}
                  className="flex-1 bg-slate-300 hover:bg-slate-400 text-slate-900"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>

    <Card title="Password Reset Requests (Pending)">
      {resetRequestsLoading ? (
        <div className="text-center py-6 text-slate-600">Loading reset requests...</div>
      ) : resetRequests.length === 0 ? (
        <div className="text-center py-6 text-slate-600">No pending reset requests.</div>
      ) : (
        <div className="grid gap-3">
          {resetRequests.map((r) => {
            const rid = String(r?._id || '');
            const userName = r?.userId?.name || 'Unknown user';
            const userEmail = r?.email || r?.userId?.email || 'N/A';
            return (
              <div key={rid} className="border border-slate-200 rounded-lg p-3 grid gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{userName}</div>
                  <div className="text-sm text-slate-600">{userEmail}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Requested: {r?.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}
                  </div>
                </div>

                <FormField
                  label="Temporary password"
                  type="password"
                  value={tempPasswordByRequestId[rid] || ''}
                  onChange={(v) => setTempPasswordByRequestId((prev) => ({ ...prev, [rid]: v }))}
                  placeholder="At least 8 chars with uppercase, lowercase, number"
                />

                <FormField
                  label="Admin note (optional)"
                  value={resetNoteByRequestId[rid] || ''}
                  onChange={(v) => setResetNoteByRequestId((prev) => ({ ...prev, [rid]: v }))}
                  placeholder="Temporary password shared via secure channel"
                />

                <Button
                  onClick={() => handleSetTemporaryPassword(rid)}
                  disabled={resolvingResetId === rid}
                >
                  {resolvingResetId === rid ? 'Updating...' : 'Set temporary password'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>

        {/* Users List */}
        <Card title="All Users">
          {users.length > 0 && (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-slate-600">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-slate-600">No users found</div>
          ) : paginatedUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-600">No users match your search</div>
          ) : (
            <>
              <div className="space-y-2">
                {paginatedUsers.map((u) => (
                  <div 
                    key={u._id} 
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-sm text-slate-600">{u.email}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editingFriendsLimit === u._id ? (
                        <div className="flex gap-2 items-center bg-slate-100 px-2 py-1 rounded text-xs">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={editingFriendsValue}
                            onChange={(e) => setEditingFriendsValue(e.target.value)}
                            className="w-16 px-2 py-1 border border-slate-300 rounded text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateMaxFriends(u._id)}
                            className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-semibold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingFriendsLimit(null);
                              setEditingFriendsValue('');
                            }}
                            className="px-2 py-1 bg-slate-300 hover:bg-slate-400 text-slate-900 rounded text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="text-center px-2 py-1 bg-slate-100 rounded text-xs">
                          <div className="text-slate-600">Friends</div>
                          <div className="font-semibold text-slate-900">{u.maxFriendsAllowed}</div>
                          <button
                            onClick={() => {
                              setEditingFriendsLimit(u._id);
                              setEditingFriendsValue(u.maxFriendsAllowed);
                            }}
                            className="mt-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium"
                          >
                            Edit limit
                          </button>
                        </div>
                      )}

                      <div className="text-center px-2 py-1 rounded text-xs font-semibold">
                        {u.isAdmin ? (
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Admin</span>
                        ) : (
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">User</span>
                        )}
                      </div>

                      <div className="text-center px-2 py-1 rounded text-xs font-semibold">
                        {u.isBlocked ? (
                          <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Blocked</span>
                        ) : (
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Active</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 sm:flex-col">
                      <Button
                        onClick={() => handleToggleBlock(u._id, u.isBlocked)}
                        disabled={blockingUserId === u._id}
                        className={`flex-1 text-xs py-1 ${
                          u.isBlocked
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-yellow-500 hover:bg-yellow-600'
                        } disabled:opacity-50`}
                      >
                        {blockingUserId === u._id ? '...' : u.isBlocked ? 'Unblock' : 'Block'}
                      </Button>
                      <Button
                        onClick={() => handleDeleteUser(u._id)}
                        disabled={deletingUserId === u._id}
                        className="flex-1 text-xs py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50"
                      >
                        {deletingUserId === u._id ? '...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-between items-center text-sm">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded border border-slate-300 text-slate-700 disabled:opacity-50 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="text-slate-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded border border-slate-300 text-slate-700 disabled:opacity-50 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
};
export default AdminDashboard;
