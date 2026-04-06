import React from 'react';
import Button from './Button.jsx';
import Card from './Card.jsx';

export const SessionConflictModal = ({ email, password, onForceLogout, loading, error }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-sm">
        <Card title="Session Conflict">
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900 font-semibold">
                You are already logged in on another device.
              </p>
              <p className="text-sm text-amber-800 mt-3">
                Your ID from that device will be <strong>logged out</strong> and <strong>opened here</strong>.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <p className="text-sm text-blue-900 font-semibold">What will happen:</p>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Confirm your password</li>
                <li>Your other session will be logged out</li>
                <li>You'll be logged in on this device</li>
              </ol>
            </div>

            <div className="pt-2">
              <label className="block text-sm text-slate-700 font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                value={password}
                readOnly
                className="w-full min-h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-slate-600"
                disabled
              />
              <p className="text-xs text-slate-500 mt-1">Your password (not editable in this dialog)</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => onForceLogout(email, password)}
                disabled={loading}
                fullWidth
                variant="primary"
              >
                {loading ? 'Logging Out Other Device...' : 'Logout Other Device & Login Here'}
              </Button>
            </div>

            <div className="text-center pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-500 mt-3">
                Alternatively, you can logout there manually or wait for that session to expire.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SessionConflictModal;
