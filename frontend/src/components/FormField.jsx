import React from 'react';

export const FormField = ({ label, value, onChange, type = 'text', placeholder, disabled }) => {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:border-[var(--brand)]"
      />
    </label>
  );
};

export default FormField;
