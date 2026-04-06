import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navLinkClass = ({ isActive }) =>
  `h-[30px] px-3.5 inline-flex items-center rounded-lg text-[13px] font-semibold whitespace-nowrap border transition-colors ${
    isActive
      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
      : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-white hover:border-slate-200'
  }`;

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
          <Link to="/" className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
            <span className="w-[7px] h-[7px] rounded-full bg-[var(--brand)] inline-block" />
            PointScorer
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/change-password"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 transition-colors"
              title="Change password"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <circle cx="8" cy="5" r="3" />
                <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={logout}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 transition-colors"
              title="Log out"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3M6 11l4-3-4-3M2 8h8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="px-3 pb-2 overflow-x-auto scrollbar-hide">
          <nav className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/90 p-[3px] w-fit">
            <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
            <NavLink to="/friends" className={navLinkClass}>Friends</NavLink>
            {user?.isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>Admin</NavLink>
            )}
          </nav>
        </div>

      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 py-3">
        {children}
      </main>
    </div>
  );
};

export default Layout;