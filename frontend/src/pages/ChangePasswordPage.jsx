import React, { useState } from 'react';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';

export const ChangePasswordPage = () => {
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setSuccess('');

		if (!currentPassword || !newPassword || !confirmPassword) {
			setError('All password fields are required');
			return;
		}
		if (newPassword.length < 8) {
			setError('New password must be at least 8 characters');
			return;
		}
		if (newPassword !== confirmPassword) {
			setError('Confirm password does not match new password');
			return;
		}

		setLoading(true);
		try {
			await axiosInstance.post('/api/auth/change-password', {
				currentPassword,
				newPassword,
			});
			setSuccess('Password changed successfully');
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (err) {
			setError(err?.response?.data?.message || 'Failed to change password');
		} finally {
			setLoading(false);
		}
	};

	return (
		<Layout>
			<div className="max-w-xl">
				<Card title="Change Password" className="bg-white/95">
					<form onSubmit={onSubmit} className="space-y-3">
						{error && <Alert type="error">{error}</Alert>}
						{success && <Alert type="success">{success}</Alert>}

						<FormField
							label="Current password"
							value={currentPassword}
							onChange={setCurrentPassword}
							type="password"
						/>
						<FormField
							label="New password"
							value={newPassword}
							onChange={setNewPassword}
							type="password"
						/>
						<FormField
							label="Confirm new password"
							value={confirmPassword}
							onChange={setConfirmPassword}
							type="password"
						/>

						<Button type="submit" disabled={loading} fullWidth>
							{loading ? 'Updating...' : 'Update password'}
						</Button>
					</form>
				</Card>
			</div>
		</Layout>
	);
};

export default ChangePasswordPage;
