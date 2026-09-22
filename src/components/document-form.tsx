'use client';
import { TestDataField } from './test-data';
import { useActionState, useState } from 'react';
import { MediaPicker } from './media-picker';
import { SlowOperationNotice } from './slow-operation-notice';
import { recoverUpload } from '@/lib/upload-recovery';
import type { DocumentResult } from '@/lib/document-actions';
import { uploadDocument } from '@/lib/document-upload';
import { dictionary, type Locale } from '@/lib/i18n';
import { documentAccess } from '@/lib/document-domain';
import type { OperationalDocument } from '@/lib/database.types';
import { usePreservedForm } from './use-preserved-form';
export function DocumentForm({
  locale,
  owner = true,
  id,
  requestId,
  initial,
  people,
  categories,
}: {
  locale: Locale;
  owner?: boolean;
  id: string;
  requestId: string;
  initial?: OperationalDocument;
  people: { id: string; display_name: string; active: boolean }[];
  categories: string[];
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(
      (previous: DocumentResult, form: FormData) =>
        recoverUpload<DocumentResult>(() => uploadDocument(previous, form), {
          error: 'docUploadIncomplete',
        }),
      {},
    ),
    [request, setRequest] = useState(requestId),
    [draftId, setDraftId] = useState(id),
    [access, setAccess] = useState(initial?.access_level ?? (owner ? 'OWNERS' : 'MANAGERS')),
    ref = usePreservedForm(),
    c = 'min-h-12 w-full rounded-xl border bg-background p-3';
  const [selected, setSelected] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  return (
    <form
      ref={ref}
      action={(data) => {
        if (selected) data.set('file', selected);
        action(data);
      }}
      onChange={() => {
        setRequest(crypto.randomUUID());
        if (!initial && state.error === 'docInvalidFile') setDraftId(crypto.randomUUID());
      }}
      className="grid max-w-3xl gap-4"
    >
      <input type="hidden" name="id" value={draftId} />
      <input type="hidden" name="requestId" value={request} />
      <input type="hidden" name="version" value={initial?.version ?? 0} />
      <SlowOperationNotice pending={pending} locale={locale} />
      <fieldset className="contents" disabled={pending}>
        <label className="grid gap-2">
          {t.docTitle}
          <input
            className={c}
            name="title"
            required
            maxLength={150}
            defaultValue={initial?.title}
            spellCheck
            lang={locale}
          />
        </label>
        <label className="grid gap-2">
          {t.docDescription}
          <textarea
            className={c}
            name="description"
            maxLength={2000}
            defaultValue={initial?.description}
            spellCheck
            lang={locale}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            {t.docCategory}
            <input
              className={c}
              name="category"
              maxLength={80}
              list="document-categories"
              defaultValue={initial?.category}
            />
            <datalist id="document-categories">
              {categories.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-2">
            {t.docExpiry}
            <input
              className={c}
              type="date"
              name="expiry_date"
              defaultValue={initial?.expiry_date ?? ''}
            />
          </label>
        </div>
        <div className="grid gap-2">
          <span>{initial ? t.docReplace : t.docFile}</span>
          <MediaPicker
            locale={locale}
            value={selected}
            onChange={(file) => {
              setSelected(file);
              setRequest(crypto.randomUUID());
            }}
            profile="document"
            allowPdf
            name="file"
            required={!initial?.current_file_id}
            disabled={pending}
            onBusy={setProcessing}
          />
          <p className="text-sm text-muted-foreground">{t.docFileHint}</p>
        </div>
        {owner ? (
          <>
            {/* Preserve legacy metadata without exposing a manual Favorites workflow. */}
            <input type="hidden" name="favorite" value={initial?.favorite ? 'on' : ''} />
            <label className="grid gap-2">
              {t.docAccess}
              <select
                className={c}
                name="access_level"
                value={access}
                onChange={(e) => setAccess(e.target.value as typeof access)}
              >
                {documentAccess.map((x) => (
                  <option key={x} value={x}>
                    {t[`docAccess${x}`]}
                  </option>
                ))}
              </select>
            </label>
            {access === 'SELECTED' && (
              <fieldset className="rounded-xl border p-4">
                <legend>{t.docSelectPeople}</legend>
                {people.map((x) => (
                  <label key={x.id} className="flex min-h-12 items-center gap-3">
                    <input
                      type="checkbox"
                      name="selected_users"
                      value={x.id}
                      defaultChecked={initial?.selected_users.includes(x.id)}
                    />
                    {x.display_name}
                    {!x.active ? ` (${t.taskInactive})` : ''}
                  </label>
                ))}
              </fieldset>
            )}
            {initial && (
              <label className="flex min-h-12 items-center gap-3">
                <input type="checkbox" name="archived" defaultChecked={initial.archived} />
                {t.docArchived}
              </label>
            )}
          </>
        ) : (
          <input type="hidden" name="access_level" value="MANAGERS" />
        )}
        {!initial && <TestDataField locale={locale} />}
        <button
          className="min-h-14 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
          disabled={pending || processing || (!selected && !initial?.current_file_id)}
        >
          {pending ? t.docUploading : t.docSave}
        </button>
        {state.error && <p role="alert">{t[state.error]}</p>}
      </fieldset>
    </form>
  );
}
