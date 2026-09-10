import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { dictionary, dateTime, number, type Locale, type Key } from '@/lib/i18n';
import type { Movement } from '@/lib/database.types';
import { Card, CardContent } from './ui/card';
import { EmptyState } from './empty-state';
import { Button } from './ui/button';
export function MovementHistory({
  movements,
  locale,
  page,
  hasNext,
  basePath,
}: {
  movements: (Movement & { actor: string; relatedLocation?: string })[];
  locale: Locale;
  page: number;
  hasNext: boolean;
  basePath: string;
}) {
  const t = dictionary(locale);
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="section-title mb-4">
        {t.history}
      </h2>
      {!movements.length ? (
        <EmptyState title={t.noActivity} hint={t.noActivityHint} />
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardContent className="divide-y p-0">
            {movements.map((m) => {
              const Icon = m.quantity > 0 ? ArrowDownLeft : ArrowUpRight;
              return (
                <article key={m.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full ${m.quantity > 0 ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium">{t[m.transaction_type]}</h3>
                        <span className="font-semibold tabular-nums">
                          {m.quantity > 0 ? '+' : ''}
                          {number(m.quantity, locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.by}: {m.actor}
                      </p>
                      {m.relatedLocation && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.transaction_type === 'TRANSFER_IN' ? t.source : t.destination}:{' '}
                          {m.relatedLocation}
                        </p>
                      )}
                      <time
                        dateTime={m.created_at}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {dateTime(m.created_at, locale)}
                      </time>
                      <p className="mt-3 text-xs">
                        {t.previous}: {number(m.previous_quantity, locale)}{' '}
                        <span aria-hidden="true">→</span> {t.resulting}:{' '}
                        {number(m.resulting_quantity, locale)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.reason}: {m.reason in t ? t[m.reason as Key] : m.reason}
                      </p>
                      {m.notes && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {m.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </CardContent>
        </Card>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        {page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={`${basePath}?page=${page - 1}#history-title`}>{t.previous}</Link>
          </Button>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          {t.page} {number(page, locale)}
        </span>
        {hasNext ? (
          <Button variant="outline" asChild>
            <Link href={`${basePath}?page=${page + 1}#history-title`}>{t.next}</Link>
          </Button>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}
