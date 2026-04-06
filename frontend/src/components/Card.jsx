import React from 'react';

export const Card = ({ title, children, actions, className = '' }) => {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100">
          <div className="text-[13px] font-semibold text-slate-800">{title}</div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-3.5 py-3">
        {children}
      </div>
    </div>
  );
};

export default Card;