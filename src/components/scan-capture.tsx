'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import { uploadScan } from '@/lib/scan-upload';
import { Button } from './ui/button';
export function ScanCapture({ locale, owner }: { locale: Locale; owner: boolean }) {
  const t = dictionary(locale),
    router = useRouter();
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>(),
    [preview, setPreview] = useState(''),
    [type, setType] = useState<'NOTE' | 'RECEIPT'>('NOTE');
  const [id, setId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Key>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function select(next?: File) {
    if (!next) return;
    setError(undefined);
    setId(crypto.randomUUID());
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || busy) return;
        setBusy(true);
        setError(undefined);
        try {
          const result = await uploadScan(file, type, id);
          if (result.error) setError(result.error);
          else if (result.id) router.push(`/scan/${result.id}`);
        } catch {
          setError('scanFailed');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="scanType"
            checked={type === 'NOTE'}
            onChange={() => {
              setType('NOTE');
              setId(crypto.randomUUID());
            }}
          />
          {t.scanNote}
        </label>
        {owner && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="scanType"
              checked={type === 'RECEIPT'}
              onChange={() => {
                setType('RECEIPT');
                setId(crypto.randomUUID());
              }}
            />
            {t.scanReceipt}
          </label>
        )}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {type === 'NOTE' ? t.scanHint : t.scanReceiptHint}
      </p>
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => select(e.target.files?.[0])}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => select(e.target.files?.[0])}
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          {t.takePhoto}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => gallery.current?.click()}
        >
          {t.scanImage}
        </Button>
      </div>
      {preview && (
        <Image
          src={preview}
          alt={t.scanOriginal}
          width={600}
          height={500}
          unoptimized
          className="max-h-80 w-full rounded-xl object-contain"
        />
      )}
      {error && <p role="alert">{t[error]}</p>}
      <Button disabled={!file || busy}>{busy ? t.loading : t.scanAnalyze}</Button>
    </form>
  );
}
