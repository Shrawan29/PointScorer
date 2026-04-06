import React from 'react';

export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  fullWidth = false,
  className = '',
}) => {
  const base = 'inline-flex items-center justify-center h-10 px-4 rounded-xl text-[13px] font-semibold border disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]';
  const width = fullWidth ? 'w-full' : '';
  const variants = {
    primary:   'bg-[var(--brand)] text-white border-[var(--brand)] hover:bg-[var(--brand-strong)]',
    secondary: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80',
    danger:    'bg-red-600 text-white border-transparent hover:bg-red-700',
    ghost:     'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${width} ${variants[variant] ?? variants.ghost} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;