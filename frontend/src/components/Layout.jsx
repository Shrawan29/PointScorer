import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navLinkClass = ({ isActive }) =>
  `px-2.5 py-1.5 rounded-md text-sm font-medium ${
    isActive ? 'text-slate-900 bg-slate-100' : 'text-slate-600 hover:text-slate-900'
  }`;

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="font-semibold text-slate-900">
              PointScorer
            </Link>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-500 hidden sm:block max-w-[140px] truncate">
                {user?.email || ''}
              </div>
              <button
                type="button"
                onClick={logout}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200"
              >
                Logout
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1 mt-3">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/friends" className={navLinkClass}>
              Friends
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;
