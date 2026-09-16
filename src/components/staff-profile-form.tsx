'use client';
import { useActionState } from 'react';
import { manageStaff } from '@/lib/staff-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { staffRoles } from '@/lib/domain';
import type { Profile } from '@/lib/database.types';
import { Button } from './ui/button';
export function StaffProfileForm({ profile, locale }: { profile: Profile; locale: Locale }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(manageStaff, {}),
    control = 'min-h-12 rounded-xl border bg-background p-3';
  return (
    <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
      <input name="id" type="hidden" value={profile.id} />
      <h2 className="text-lg font-semibold">{profile.display_name}</h2>
      <p className="break-all text-xs">
        {t.staffIdentity}: {profile.id}
      </p>
      <label className="grid gap-2">
        {t.staffName}
        <input
          name="name"
          defaultValue={profile.display_name}
          maxLength={100}
          required
          className={control}
          disabled={pending}
        />
      </label>
      <label className="grid gap-2">
        {t.staffRole}
        <select
          name="role"
          defaultValue={profile.role === 'OWNER' || profile.role === 'MANAGER' ? profile.role : ''}
          required
          className={control}
          disabled={pending}
        >
          <option value="" disabled>
            {t.roleReview}
          </option>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {t[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        {t.language}
        <select
          name="language"
          defaultValue={profile.language}
          className={control}
          disabled={pending}
        >
          <option value="en">{t.en}</option>
          <option value="es">{t.es}</option>
        </select>
      </label>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={profile.active} disabled={pending} />
        {t.itemActive}
      </label>
      {profile.must_change_password && <p>{t.passwordPending}</p>}

      {state.error && <p role="alert">{t[state.error]}</p>}
      {state.success && <p role="status">{t.staffSaved}</p>}
      <Button disabled={pending}>{t.staffSave}</Button>
    </form>
  );
}
