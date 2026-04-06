import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navLinkClass = ({ isActive }) =>
  `h-8 px-3.5 inline-flex items-center rounded-lg text-[13px] font-semibold whitespace-nowrap border transition-colors ${
    isActive
      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
      : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-white hover:border-slate-200'
  }`;

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col gap-2.5">

          {/* Top row */}
          <div className="flex items-start justify-between gap-2 sm:items-center">
            <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
              <span className="w-2 h-2 rounded-full bg-[var(--brand)] inline-block" />
              PointScorer
            </Link>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="hidden sm:inline-flex text-[12px] text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5 max-w-[160px] truncate">
                {user?.email || ''}
              </span>
              <Link
                to="/change-password"
                className="h-8 px-3 inline-flex items-center rounded-xl text-[12px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200/70 transition-colors"
              >
                Change password
              </Link>
              <button
                type="button"
                onClick={logout}
                className="h-8 px-3 inline-flex items-center rounded-xl text-[12px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200/70 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>

          {/* Nav pill group */}
          <nav className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/90 p-1 w-fit">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/friends" className={navLinkClass}>
              Friends
            </NavLink>
            {user?.isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>

        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-2.5 sm:px-4 py-3.5 sm:py-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;