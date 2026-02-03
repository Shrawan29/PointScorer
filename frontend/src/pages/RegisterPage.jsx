import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';

export const RegisterPage = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await axiosInstance.post('/api/auth/register', { name, email, password });
      setSuccess('Account created. Redirecting to login...');
      setTimeout(() => navigate('/login', { replace: true }), 700);
    } catch (err) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">PointScorer</h1>
          <p className="text-sm text-slate-600 mt-2">Create your account</p>
        </div>
        <Card title="Register">
          <form onSubmit={onSubmit} className="space-y-3">
            {error && <Alert type="error">{error}</Alert>}
            {success && <Alert type="success">{success}</Alert>}
            <FormField label="Name" value={name} onChange={setName} />
            <FormField label="Email" value={email} onChange={setEmail} type="email" />
            <FormField label="Password" value={password} onChange={setPassword} type="password" />
            <Button type="submit" disabled={loading} fullWidth>
              {loading ? 'Creating...' : 'Create account'}
            </Button>
          </form>

          <div className="text-xs text-slate-600 mt-3 text-center">
            Already have an account? <Link className="text-slate-900 underline" to="/login">Login</Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
