import React from 'react';

export const PageHeader = ({ title, subtitle, actions }) => {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h1 className="text-[18px] font-semibold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

export default PageHeader;