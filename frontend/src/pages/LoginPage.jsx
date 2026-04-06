import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import SessionConflictModal from '../components/SessionConflictModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionConflict, setSessionConflict] = useState(false);
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false);
  const [forceLogoutError, setForceLogoutError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSessionConflict(false);
    setForceLogoutError('');

    try {
      const res = await axiosInstance.post('/api/auth/login', { email, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err?.response?.status === 409) {
        setSessionConflict(true);
      } else {
        setError(err?.response?.data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForceLogout = async (email, password) => {
    setForceLogoutError('');
    setForceLogoutLoading(true);

    try {
      const res = await axiosInstance.post('/api/auth/force-logout-other-session', { email, password });
      login(res.data.token, res.data.user);
      setSessionConflict(false);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setForceLogoutError(err?.response?.data?.message || 'Failed to force logout other session');
    } finally {
      setForceLogoutLoading(false);
    }
  };

  if (sessionConflict) {
    return (
      <SessionConflictModal
        email={email}
        password={password}
        onForceLogout={handleForceLogout}
        loading={forceLogoutLoading}
        error={forceLogoutError}
      />
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">PointScorer</h1>
          <p className="mt-2 text-sm text-slate-600">Cricket scoring with friends</p>
        </div>
        <Card title="Login">
          <form onSubmit={onSubmit} className="space-y-3">
            {error && <Alert type="error">{error}</Alert>}
            <FormField label="Email" value={email} onChange={setEmail} type="email" />
            <FormField label="Password" value={password} onChange={setPassword} type="password" />
            <Button type="submit" disabled={loading} fullWidth>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

			<div className="text-xs text-slate-600 mt-3 text-center">
				Forgot password?{' '}
        <Link className="font-semibold text-[var(--brand)] underline" to="/request-password-reset">
					Request reset
				</Link>
			</div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
