import React from 'react';

export const Alert = ({ type = 'info', children }) => {
  const base = 'border rounded-md p-3 text-xs sm:text-sm';
  const styles =
    type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-slate-50 border-slate-200 text-slate-800';

  return <div className={`${base} ${styles}`}>{children}</div>;
};

export default Alert;
