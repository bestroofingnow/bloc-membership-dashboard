'use client';

import { clsx } from 'clsx';
import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /** When provided, a clear (×) button appears on the right while the field has a value. */
  onClear?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, onClear, value, ...props }, ref) => {
    const showClear = !!onClear && value != null && String(value).length > 0;
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            value={value}
            className={clsx(
              'w-full px-4 py-2.5 rounded-lg border bg-white',
              'transition-all duration-200',
              'focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none',
              icon && 'pl-10',
              showClear && 'pr-10',
              error
                ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                : 'border-slate-300',
              className
            )}
            {...props}
          />
          {showClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Convenience component for search
interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onSearch?: (value: string) => void;
}

export function SearchInput({
  placeholder = 'Search...',
  onSearch,
  onChange,
  value,
  ...props
}: SearchInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onSearch?.(e.target.value);
  };

  // Clear the field by emitting an empty change to the controlled consumer.
  const handleClear = () => {
    const synthetic = {
      target: { value: '' },
      currentTarget: { value: '' },
    } as React.ChangeEvent<HTMLInputElement>;
    onChange?.(synthetic);
    onSearch?.('');
  };

  return (
    <Input
      type="search"
      placeholder={placeholder}
      icon={<Search size={18} />}
      value={value}
      onChange={handleChange}
      onClear={handleClear}
      {...props}
    />
  );
}
