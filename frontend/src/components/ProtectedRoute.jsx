import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  // Fallback to localStorage token while context catches up in edge cases.
  const allowed = isAuthenticated || Boolean(token);
  if (!allowed) return <Navigate to="/login" replace />;
  return <Outlet />;
};

export default ProtectedRoute;
