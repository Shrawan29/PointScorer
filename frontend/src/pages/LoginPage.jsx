import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axiosInstance.post('/api/auth/login', { email, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">PointScorer</h1>
          <p className="text-sm text-slate-600 mt-2">Cricket scoring with friends</p>
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
            No account? <Link className="text-slate-900 underline" to="/register">Register</Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
