import React from 'react';
import Button from './Button.jsx';
import Card from './Card.jsx';

export const SessionConflictModal = ({ email, password, onForceLogout, loading, error }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center px-4 py-8 z-50">
      <div className="w-full max-w-sm">
        <Card title="Session Conflict">
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900">
                <strong>You are already logged in on another device.</strong>
              </p>
              <p className="text-sm text-amber-800 mt-2">
                Your ID will be logged out from that device and you can login here.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-slate-600 font-medium">To proceed:</p>
              <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                <li>Confirm your password below</li>
                <li>We'll logout your other session</li>
                <li>You'll be logged in here</li>
              </ol>
            </div>

            <div className="pt-2">
              <label className="block text-sm text-slate-700 font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                value={password}
                readOnly
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
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
                {loading ? 'Logging Out Other Device...' : 'Force Logout Other Device'}
              </Button>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                Or wait for your other session to expire automatically.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SessionConflictModal;
