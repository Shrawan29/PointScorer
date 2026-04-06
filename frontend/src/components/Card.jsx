import React from 'react';

export const Card = ({ title, children, actions, className = '' }) => {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 sm:p-4 ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="font-display text-base sm:text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
