import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  const variantClasses = {
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-medium',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200/60 font-medium',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200/60 font-medium',
    info: 'bg-blue-50 text-blue-700 border border-blue-200/60 font-medium',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200/60 font-medium',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200 font-medium',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
};
