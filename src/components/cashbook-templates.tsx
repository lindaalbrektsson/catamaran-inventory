'use client';

import { useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import type { CashbookTemplate } from '@/lib/cashbook-types';
import { CashbookAmount, CashbookForm, cashbookControl, cashbookMoney } from './cashbook-controls';
import { Input } from './ui/input';
import { Button } from './ui/button';

function TemplateForm({
  locale,
  kind,
  template,
  onClose,
}: {
  locale: Locale;
  kind: 'FOOD' | 'MONTHLY';
  template?: CashbookTemplate;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  return (
    <CashbookForm
      locale={locale}
      operation="SAVE_TEMPLATE"
      title={kind === 'FOOD' ? t.cashbookFoodTemplates : t.cashbookRecurringTemplates}
      onSaved={onClose}
      onCancel={onClose}
    >
      <input type="hidden" name="kind" value={kind} />
      {template && <input type="hidden" name="id" value={template.id} />}
      <label className="grid gap-2 text-sm font-medium">
        {t.cashbookNameEn}
        <Input
          name="name_en"
          defaultValue={template?.name_en ?? ''}
          maxLength={120}
          required
          lang="en"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {t.cashbookNameEs}
        <Input
          name="name_es"
          defaultValue={template?.name_es ?? ''}
          maxLength={120}
          required
          lang="es"
        />
      </label>
      <CashbookAmount
        label={kind === 'FOOD' ? t.cashbookDefaultPrice : t.cashbookDefaultAmount}
        name="default_amount"
        defaultCents={template?.default_amount_cents}
        required={false}
      />
      {kind === 'MONTHLY' && (
        <>
          <label className="grid gap-2 text-sm font-medium">
            {t.cashbookDueDay}
            <Input
              name="due_day"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              step={1}
              defaultValue={template?.due_day ?? ''}
            />
          </label>
          <p className="text-sm text-muted-foreground">{t.cashbookDueDayHelp}</p>
        </>
      )}
      <label className="flex min-h-12 items-center gap-3 text-sm font-medium">
        <input
          name="active"
          type="checkbox"
          defaultChecked={template?.active ?? true}
          className="size-5"
        />
        {t.cashbookActive}
      </label>
      <p className="text-sm text-muted-foreground">{t.cashbookTemplateHelp}</p>
    </CashbookForm>
  );
}

export function CashbookTemplates({
  locale,
  templates,
}: {
  locale: Locale;
  templates: CashbookTemplate[];
}) {
  const t = dictionary(locale);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <details className="rounded-2xl border bg-card p-4 sm:p-5">
      <summary className="min-h-12 cursor-pointer py-2 font-semibold">
        {t.cashbookTemplates}
      </summary>
      <div className="grid gap-6 pt-4 lg:grid-cols-2">
        {(['FOOD', 'MONTHLY'] as const).map((kind) => (
          <section key={kind} className="grid content-start gap-3">
            <h3 className="font-semibold">
              {kind === 'FOOD' ? t.cashbookFoodTemplates : t.cashbookRecurringTemplates}
            </h3>
            {templates
              .filter((template) => template.kind === kind)
              .map((template) => (
                <div key={template.id}>
                  {editing === template.id ? (
                    <TemplateForm
                      locale={locale}
                      kind={kind}
                      template={template}
                      onClose={() => setEditing(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {locale === 'es' ? template.name_es : template.name_en}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {template.active ? t.cashbookActive : t.cashbookInactive}
                          {template.default_amount_cents != null &&
                            ` · ${cashbookMoney(template.default_amount_cents, locale)}`}
                        </p>
                        {template.default_amount_cents == null && (
                          <p className="text-sm text-muted-foreground">{t.cashbookSetupRequired}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditing(template.id)}
                      >
                        {t.cashbookEdit}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {editing === `new-${kind}` ? (
              <TemplateForm locale={locale} kind={kind} onClose={() => setEditing(null)} />
            ) : (
              <button
                type="button"
                className={cashbookControl + ' text-left font-medium'}
                onClick={() => setEditing(`new-${kind}`)}
              >
                {kind === 'FOOD' ? t.cashbookAddConcept : t.cashbookAddRecurring}
              </button>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
