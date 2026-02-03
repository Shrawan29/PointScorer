import React from 'react';

export const PageHeader = ({ title, subtitle, actions }) => {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <div className="text-sm text-slate-600 mt-1">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
};

export default PageHeader;
