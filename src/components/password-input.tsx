'use client';
import { useEffect, useId, useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
import { Input } from './ui/input';

export function PasswordInput({
  locale,
  id,
  className = '',
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const t = dictionary(locale);
  useEffect(() => {
    const hide = () => setVisible(false);
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return (
    <span className="relative block min-w-0">
      <Input
        {...props}
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={`${className} min-h-12 pr-12`}
      />
      <button
        type="button"
        aria-label={visible ? t.hidePassword : t.showPassword}
        aria-controls={inputId}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </span>
  );
}
