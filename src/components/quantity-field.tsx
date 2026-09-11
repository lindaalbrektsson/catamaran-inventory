'use client';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function QuantityField({
  locale,
  value,
  onChange,
  invalid,
  disabled,
  shortcuts = [1, 6, 12, 24],
  showHint = true,
}: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  shortcuts?: number[];
  showHint?: boolean;
}) {
  const t = dictionary(locale);
  return (
    <div className="field">
      <Label htmlFor="quantity">{t.quantity}</Label>
      <Input
        id="quantity"
        name="quantity"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(',', '.'))}
        type="text"
        inputMode="decimal"
        required
        maxLength={15}
        pattern="(?:0|[1-9][0-9]{0,10})(?:\.[0-9]{1,3})?"
        autoComplete="off"
        className="h-16 text-3xl! font-semibold tabular-nums"
        aria-invalid={invalid}
        aria-describedby={showHint || invalid ? 'quantity-hint' : undefined}
      />
      <div role="group" aria-label={t.quickQuantity} className="grid grid-cols-4 gap-2">
        {shortcuts.map((amount) => (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            key={amount}
            aria-pressed={value === String(amount)}
            onClick={() => onChange(String(amount))}
          >
            {number(amount, locale)}
          </Button>
        ))}
      </div>
      {(showHint || invalid) && (
        <p
          id="quantity-hint"
          className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {t.fieldQuantity}
        </p>
      )}
    </div>
  );
}
