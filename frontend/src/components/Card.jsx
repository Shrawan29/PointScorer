import React from 'react';

export const Card = ({ title, children, actions, className = '' }) => {
  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="font-medium text-slate-900 text-base">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
