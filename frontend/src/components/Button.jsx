import React from 'react';

export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
}) => {
  const base = 'px-3 py-2 rounded-md text-sm border disabled:opacity-60';
  const styles =
    variant === 'primary'
      ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
      : variant === 'danger'
        ? 'bg-white text-red-700 border-red-200 hover:bg-red-50'
        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
};

export default Button;
