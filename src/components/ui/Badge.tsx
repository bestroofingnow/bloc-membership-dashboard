'use client';

import { clsx } from 'clsx';
import { ChapterName } from '@/types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  chapter?: ChapterName;
  size?: 'sm' | 'md';
  className?: string;
}

const chapterStyles: Record<ChapterName, string> = {
  North: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  South: 'bg-amber-100 text-amber-700 border-amber-200',
  Uptown: 'bg-purple-100 text-purple-700 border-purple-200',
  FLOC: 'bg-blue-100 text-blue-700 border-blue-200',
  Alumni: 'bg-gray-100 text-gray-600 border-gray-200',
};

const variantStyles = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  error: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export function Badge({
  children,
  variant = 'default',
  chapter,
  size = 'sm',
  className,
}: BadgeProps) {
  const styles = chapter ? chapterStyles[chapter] : variantStyles[variant];

  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold rounded-full border',
        styles,
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}
