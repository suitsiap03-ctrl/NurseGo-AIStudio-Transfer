import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leftIcon?: React.ReactNode;
  containerClassName?: string;
  toggleAriaLabelShow?: string;
  toggleAriaLabelHide?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  leftIcon,
  className = '',
  containerClassName = '',
  toggleAriaLabelShow = 'Tampilkan kata sandi',
  toggleAriaLabelHide = 'Sembunyikan kata sandi',
  disabled,
  ...rest
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${containerClassName}`}>
      {leftIcon && (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-slate-400">
          {leftIcon}
        </div>
      )}
      <input
        {...rest}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? toggleAriaLabelHide : toggleAriaLabelShow}
        aria-pressed={visible}
        title={visible ? toggleAriaLabelHide : toggleAriaLabelShow}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
