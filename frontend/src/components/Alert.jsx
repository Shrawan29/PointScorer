import React from 'react';

export const Alert = ({ type = 'info', children, onClose }) => {
  const base = 'border rounded-xl p-3 text-xs sm:text-sm shadow-sm';
  const styles =
    type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-slate-50 border-slate-200 text-slate-800';

  return (
    <div className={`${base} ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>
        {typeof onClose === 'function' ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-current/20 px-2 py-1 text-[11px] font-semibold opacity-85 hover:opacity-100"
            aria-label="Dismiss alert"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default Alert;
