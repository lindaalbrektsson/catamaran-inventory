-- Optional decoration only: preserve category identity, names, active state and permissions.
alter table public.categories
 add column icon_key text null check (icon_key in ('package','wrench','waves','glass','lifebuoy','spray','food','cog','hammer','box','basket','droplets')),
 add column accent_key text null check (accent_key in ('neutral','teal','blue','sand','amber','coral','slate','green'));
-- Existing category RLS and audit triggers continue to apply.
