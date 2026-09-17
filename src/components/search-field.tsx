'use client';
import { useId } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui/input';
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden="true" className="absolute left-3 top-4 size-4 text-muted-foreground" />
      <Input
        id={id}
        type="search"
        className="pl-10"
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
