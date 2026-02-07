'use client';

import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children,
  className,
  padding = 'md',
  hover = true,
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl shadow-card border border-slate-100',
        hover && 'transition-shadow duration-200 hover:shadow-card-hover',
        paddingStyles[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function CardHeader({ children, className, action }: CardHeaderProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between border-b border-slate-100 pb-4 mb-4',
        className
      )}
    >
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  subtitle?: string;
}

export function CardTitle({ children, className, subtitle }: CardTitleProps) {
  return (
    <div>
      <h3 className={clsx('text-lg font-bold text-slate-900', className)}>
        {children}
      </h3>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
