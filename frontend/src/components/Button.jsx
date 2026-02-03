import React from 'react';

export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  fullWidth = false,
}) => {
  const baseClasses = 'px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const widthClass = fullWidth ? 'w-full' : '';
  const variantClasses =
    variant === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-800'
      : variant === 'secondary'
        ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
        : variant === 'danger'
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';

  return (
    <button 
      type={type} 
      onClick={onClick} 
      disabled={disabled} 
      className={`${baseClasses} ${widthClass} ${variantClasses}`}
    >
      {children}
    </button>
  );
};

export default Button;
