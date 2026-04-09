import React, { useMemo } from 'react';
import Card from './Card';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const AdminUserFriendCounts = ({ users = [] }) => {
  const normalizedUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];

    return users.map((u) => ({
      _id: String(u?._id || u?.id || ''),
      name: String(u?.name || 'Unnamed user'),
      email: String(u?.email || 'N/A'),
      friendsCreatedCount: toNumber(u?.friendsCreatedCount, 0),
      maxFriendsAllowed: toNumber(u?.maxFriendsAllowed, 0),
    }));
  }, [users]);

  const rankedUsers = useMemo(() => {
    return [...normalizedUsers].sort((a, b) => {
      if (b.friendsCreatedCount !== a.friendsCreatedCount) {
        return b.friendsCreatedCount - a.friendsCreatedCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [normalizedUsers]);

  const totalFriends = useMemo(() => {
    return normalizedUsers.reduce((sum, u) => sum + u.friendsCreatedCount, 0);
  }, [normalizedUsers]);

  const usersAtLimit = useMemo(() => {
    return normalizedUsers.filter((u) => {
      return u.maxFriendsAllowed > 0 && u.friendsCreatedCount >= u.maxFriendsAllowed;
    }).length;
  }, [normalizedUsers]);

  const averageFriends = normalizedUsers.length > 0
    ? (totalFriends / normalizedUsers.length).toFixed(1)
    : '0.0';

  return (
    <Card title="Friends Added By Users">
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
            <div className="text-[11px] text-slate-600">Total friends</div>
            <div className="text-sm font-semibold text-slate-900">{totalFriends}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
            <div className="text-[11px] text-slate-600">Avg per user</div>
            <div className="text-sm font-semibold text-slate-900">{averageFriends}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
            <div className="text-[11px] text-slate-600">At limit</div>
            <div className="text-sm font-semibold text-slate-900">{usersAtLimit}</div>
          </div>
        </div>

        {rankedUsers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-600">
            No users found.
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {rankedUsers.map((u) => {
              const usagePercent = u.maxFriendsAllowed > 0
                ? Math.min(100, Math.round((u.friendsCreatedCount / u.maxFriendsAllowed) * 100))
                : 0;

              return (
                <div
                  key={u._id || `${u.email}-${u.name}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{u.name}</div>
                      <div className="truncate text-xs text-slate-600">{u.email}</div>
                    </div>
                    <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                      {u.friendsCreatedCount}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Limit: {u.maxFriendsAllowed || '-'}</span>
                    <span>{u.maxFriendsAllowed > 0 ? `${usagePercent}% used` : 'No limit'}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div
                      className={`h-1.5 rounded-full ${usagePercent >= 100 ? 'bg-red-500' : usagePercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default AdminUserFriendCounts;
