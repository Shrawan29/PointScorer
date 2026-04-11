import React, { useEffect, useRef, useState } from 'react';
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
  const [activeRoomsCount, setActiveRoomsCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const userDisplayName = String(user?.name || 'User');
  const userEmail = String(user?.email || '').trim();

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const roomsRes = await axiosInstance.get('/api/live-rooms').catch(() => ({ data: [] }));
        if (cancelled) return;

        const roomRows = Array.isArray(roomsRes?.data) ? roomsRes.data : [];
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

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const onWindowMouseDown = (event) => {
      const root = profileMenuRef.current;
      if (root && !root.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const onWindowKeyDown = (event) => {
      if (String(event?.key || '').toLowerCase() === 'escape') {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onWindowMouseDown);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('mousedown', onWindowMouseDown);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [profileMenuOpen]);

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

            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <Link
                  to="/dashboard?showUpdate=1"
                  title="Read update guide"
                  aria-label="Read update guide"
                  className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-[12px] font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                >
                  i
                </Link>

                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    title="Open profile menu"
                    aria-label="Open profile menu"
                    aria-expanded={profileMenuOpen}
                    onClick={() => setProfileMenuOpen((prev) => !prev)}
                    className="w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <circle cx="8" cy="5" r="3" />
                      <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
                    </svg>
                  </button>

                  {profileMenuOpen ? (
                    <div className="absolute right-0 top-full mt-2 w-[min(90vw,15rem)] rounded-xl border border-slate-200 bg-white shadow-lg z-40">
                      <div className="border-b border-slate-200 px-3 py-2">
                        <div className="truncate text-sm font-semibold text-slate-900">{userDisplayName}</div>
                        <div className="truncate text-xs text-slate-500">{userEmail || 'No email on file'}</div>
                      </div>
                      <div className="p-1.5">
                        <Link
                          to="/change-password"
                          onClick={() => setProfileMenuOpen(false)}
                          className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100 block"
                        >
                          Change password
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            void logout();
                          }}
                          className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Log out
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <Link
                to="/friends?tab=active"
                title="Active rooms currently running"
                className={`h-[28px] px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap ${
                  activeRoomsCount > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-100 text-slate-500'
                }`}
              >
                Active Rooms
                <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-black/[0.07] px-1 text-[9.5px] font-bold leading-none">
                  {activeRoomsCount}
                </span>
              </Link>
            </div>
          </div>

          {/* Nav */}
          <div className="overflow-x-auto scrollbar-hide pb-2.5">
            <nav className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/80 p-[3px] w-fit">
              <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
              <NavLink to="/friends" className={navLinkClass}>Friends</NavLink>
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