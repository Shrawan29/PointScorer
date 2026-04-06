import React from 'react';

export const FormField = ({ label, value, onChange, type = 'text', placeholder, disabled }) => {
  return (
    <div>
      {label && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 placeholder:text-slate-400 disabled:opacity-50 focus:outline-none focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand)]/20 transition-all"
      />
    </div>
  );
};

export default FormField;