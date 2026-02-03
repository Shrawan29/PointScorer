import React from 'react';

export const Card = ({ title, children, actions }) => {
  return (
    <div className="bg-white border rounded-lg p-4">
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="font-medium text-slate-900">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
