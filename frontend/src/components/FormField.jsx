import React from 'react';

export const FormField = ({ label, value, onChange, type = 'text', placeholder, disabled }) => {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 border rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />
    </label>
  );
};

export default FormField;
