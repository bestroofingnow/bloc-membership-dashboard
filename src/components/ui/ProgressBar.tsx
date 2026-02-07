'use client';

import { clsx } from 'clsx';

interface ProgressBarProps {
  current: number;
  target: number;
  label?: string;
  showNumbers?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'amber' | 'purple';
}

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const colorStyles = {
  blue: 'bg-bloc-blue',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  purple: 'bg-purple-500',
};

export function ProgressBar({
  current,
  target,
  label,
  showNumbers = true,
  size = 'md',
  color = 'blue',
}: ProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100);
  const isComplete = current >= target;

  return (
    <div className="w-full">
      {(label || showNumbers) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-sm font-medium text-slate-700">{label}</span>
          )}
          {showNumbers && (
            <span className="text-sm text-slate-500">
              {current} / {target}
              {isComplete && (
                <span className="ml-1.5 text-emerald-600 font-medium">
                  Goal Met!
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <div
        className={clsx(
          'w-full bg-slate-200 rounded-full overflow-hidden',
          sizeStyles[size]
        )}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500 ease-out',
            isComplete ? 'bg-emerald-500' : colorStyles[color]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
