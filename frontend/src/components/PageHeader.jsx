import React from 'react';

export const PageHeader = ({ title, subtitle, actions }) => {
  return (
    <div className="mb-3.5 flex flex-col gap-2.5 sm:mb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-600">{subtitle}</div>}
      </div>
      {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
    </div>
  );
};

export default PageHeader;
