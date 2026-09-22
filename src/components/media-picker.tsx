'use client';
import { useEffect, useRef, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { optimizedImage, type ImageProfile, imageProfiles } from '@/lib/image-processing-client';
import { Button } from './ui/button';
export function MediaPicker({
  locale,
  value,
  onChange,
  profile,
  allowPdf = false,
  disabled = false,
  name,
  required = false,
  previewAlt,
  onBusy,
}: {
  locale: Locale;
  value: File | null;
  onChange: (file: File | null) => void;
  profile: ImageProfile;
  allowPdf?: boolean;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  previewAlt?: string;
  onBusy?: (busy: boolean) => void;
}) {
  const t = dictionary(locale),
    camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!value || value.type === 'application/pdf') {
      return;
    }
    const url = URL.createObjectURL(value);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [value]);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    onBusy?.(true);
    setError(false);
    try {
      if (allowPdf && file.type === 'application/pdf') {
        if (file.size <= 0 || file.size > imageProfiles[profile].sourceLimit) throw Error('size');
        onChange(file);
      } else onChange(await optimizedImage(file, profile));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  const accept = allowPdf
    ? 'application/pdf,image/jpeg,image/png,image/webp'
    : 'image/jpeg,image/png,image/webp';
  return (
    <div className="grid gap-3">
      <input
        ref={camera}
        aria-label={t.takePhoto}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={gallery}
        aria-label={allowPdf ? t.docFile : t.uploadImage}
        type="file"
        name={name}
        accept={accept}
        required={required && !value}
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => camera.current?.click()}
        >
          {t.takePhoto}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => gallery.current?.click()}
        >
          {allowPdf ? t.docChooseFile : t.uploadImage}
        </Button>
      </div>
      {busy && <p role="status">{t.receiptProcessing}</p>}
      {error && (
        <p role="alert">
          {allowPdf
            ? t.docInvalidFile
            : profile === 'need'
              ? t.needPhotoInvalid
              : t.RECEIPT_INVALID}
        </p>
      )}
      {value && (
        <div className="grid gap-2">
          {value.type !== 'application/pdf' && (
            // Local blob preview only; never requests a remote image or optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={preview}
              alt={previewAlt ?? t.receiptPreview}
              width={600}
              height={800}
              className="max-h-64 w-full rounded-xl border object-contain"
            />
          )}
          <p role={allowPdf ? 'status' : undefined} className="break-all text-sm">
            {value.name}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || busy}
              onClick={() => gallery.current?.click()}
            >
              {t.mediaReplace}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || busy}
              onClick={() => {
                onChange(null);
                setError(false);
              }}
            >
              {t.photoRemove}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
