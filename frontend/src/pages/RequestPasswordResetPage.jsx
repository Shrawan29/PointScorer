import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';

export const RequestPasswordResetPage = () => {
	const [email, setEmail] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	const onSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setSuccess('');

		if (!email.trim()) {
			setError('Email is required');
			return;
		}

		setLoading(true);
		try {
			const res = await axiosInstance.post('/api/auth/request-password-reset', {
				email: email.trim(),
			});
			setSuccess(res?.data?.message || 'Reset request submitted');
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to submit reset request');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center px-4 py-8">
			<div className="w-full max-w-sm">
				<div className="mb-6 text-center">
					<h1 className="text-2xl font-bold text-slate-900">PointScorer</h1>
					<p className="text-sm text-slate-600 mt-2">Request password reset</p>
				</div>

				<Card title="Request Reset">
					<form onSubmit={onSubmit} className="space-y-3">
						{error && <Alert type="error">{error}</Alert>}
						{success && <Alert type="success">{success}</Alert>}

						<FormField
							label="Email"
							type="email"
							value={email}
							onChange={setEmail}
							placeholder="you@example.com"
						/>

						<Button type="submit" disabled={loading} fullWidth>
							{loading ? 'Submitting...' : 'Submit reset request'}
						</Button>
					</form>

					<div className="text-xs text-slate-600 mt-3 text-center">
						Back to <Link className="text-slate-900 underline" to="/login">Login</Link>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default RequestPasswordResetPage;
