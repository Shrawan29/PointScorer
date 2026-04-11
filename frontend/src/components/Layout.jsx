import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance.js';
import { useAuth } from '../context/AuthContext.jsx';

const navLinkClass = ({ isActive }) =>
  `h-[28px] px-3 inline-flex items-center gap-1.5 rounded-[9px] text-[12.5px] font-medium whitespace-nowrap border transition-colors ${
    isActive
      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
      : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-white hover:border-slate-200'
  }`;

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const [activeFriendsCount, setActiveFriendsCount] = useState(0);
  const [activeRoomsCount, setActiveRoomsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const [presenceRes, roomsRes] = await Promise.all([
          axiosInstance.get('/api/presence/friends').catch(() => ({ data: {} })),
          axiosInstance.get('/api/live-rooms').catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;

        const activeFriendsFromCount = Number(presenceRes?.data?.onlineCount);
        const activeFriendsFromList = Array.isArray(presenceRes?.data?.friends)
          ? presenceRes.data.friends.filter((row) => Boolean(row?.isOnline)).length
          : 0;
        const nextActiveFriendsCount = Number.isFinite(activeFriendsFromCount)
          ? activeFriendsFromCount
          : activeFriendsFromList;
        const roomRows = Array.isArray(roomsRes?.data) ? roomsRes.data : [];

        setActiveFriendsCount(Math.max(0, nextActiveFriendsCount));
        setActiveRoomsCount(Math.max(0, roomRows.length));
      } catch {
        // ignore transient failures
      }
    };

    void loadSummary();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadSummary();
    }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/70">

        <div className="mx-auto w-full max-w-5xl px-4 sm:px-5 pt-2.5 pb-0">

          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <Link
              to="/"
              className="flex items-center gap-2 text-[15px] font-medium text-slate-900 truncate shrink-0"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-[var(--brand)] shrink-0" />
              PointScorer
            </Link>

            <div className="flex items-center gap-1.5">
              {/* Active rooms — lives up here with the other utility controls */}
              <Link
                to="/live-friends"
                title="Active rooms currently running"
                className={`h-[30px] px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[11.5px] font-medium transition-colors whitespace-nowrap ${
                  activeRoomsCount > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-100 text-slate-500'
                }`}
              >
                Active Rooms
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/[0.07] px-1 text-[10px] font-bold leading-none">
                  {activeRoomsCount}
                </span>
              </Link>

              <span className="w-px h-4 bg-slate-200 mx-0.5" />

              <Link
                to="/dashboard?showUpdate=1"
                title="Read update guide"
                aria-label="Read update guide"
                className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-[12px] font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                i
              </Link>

              <Link
                to="/change-password"
                title="Change password"
                className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <circle cx="8" cy="5" r="3" />
                  <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
                </svg>
              </Link>

              <button
                type="button"
                onClick={logout}
                title="Log out"
                className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3M6 11l4-3-4-3M2 8h8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Nav */}
          <div className="overflow-x-auto scrollbar-hide pb-2.5">
            <nav className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/80 p-[3px] w-fit">
              <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
              <NavLink to="/friends" className={navLinkClass}>Friends</NavLink>
              <NavLink to="/live-friends" className={navLinkClass}>
                <span>Active Friends</span>
                <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-current/10 px-1 text-[10px] font-bold leading-none">
                  {activeFriendsCount}
                </span>
              </NavLink>
              {user?.isAdmin && (
                <NavLink to="/admin" className={navLinkClass}>Admin</NavLink>
              )}
            </nav>
          </div>

        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-5 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;