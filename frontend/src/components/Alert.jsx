import React, { useCallback, useEffect, useState } from 'react';

export const Alert = ({
  type = 'info',
  children,
  onClose,
  floating = false,
  autoHide = true,
  durationMs = 5000,
}) => {
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    if (typeof onClose === 'function') {
      onClose();
      return;
    }
    setVisible(false);
  }, [onClose]);

  useEffect(() => {
    setVisible(true);
  }, [children, type]);

  useEffect(() => {
    if (!autoHide) return undefined;
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0) return undefined;

    const timer = setTimeout(() => {
      dismiss();
    }, ms);

    return () => clearTimeout(timer);
  }, [autoHide, durationMs, dismiss]);

  if (!visible) return null;

  const base = 'border rounded-xl p-3 text-xs sm:text-sm shadow-sm';
  const styles =
    type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-slate-50 border-slate-200 text-slate-800';

  const floatingStyles = floating
    ? 'fixed left-1/2 -translate-x-1/2 bottom-20 sm:bottom-4 z-[70] w-[min(92vw,36rem)] shadow-lg'
    : 'sticky top-[88px] z-40 w-full';

  return (
    <div className={`${base} ${styles} ${floatingStyles}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>
        {typeof onClose === 'function' || !autoHide ? (
          <button
            type="button"
            onClick={dismiss}
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
