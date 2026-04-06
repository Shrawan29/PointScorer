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
  const baseClasses = 'inline-flex min-h-9 items-center justify-center px-3.5 rounded-lg border text-[13px] font-semibold tracking-[0.01em] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:translate-y-px';
  const widthClass = fullWidth ? 'w-full' : '';
  const variantClasses =
    variant === 'primary'
      ? 'bg-[var(--brand)] text-white border-[var(--brand)] hover:bg-[var(--brand-strong)]'
      : variant === 'secondary'
        ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80'
        : variant === 'danger'
          ? 'bg-red-600 text-white border-transparent hover:bg-red-700'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50';

  return (
    <button 
      type={type} 
      onClick={onClick} 
      disabled={disabled} 
      className={`${baseClasses} ${widthClass} ${variantClasses} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;
