import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold text-slate-900">
            PointScorer
          </Link>
          <nav className="flex items-center gap-2">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/friends" className={navLinkClass}>
              Friends
            </NavLink>
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600 hidden sm:block">{user?.email || ''}</div>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
};

export default Layout;
