-- Read-only Storage metadata checks. No receipt content or user details.
select id,public,file_size_limit,allowed_mime_types::text as allowed_mime_types
from storage.buckets where id in ('receipts','need-photos') order by id;

select policyname,cmd,roles::text as roles,permissive,qual,with_check
from pg_policies where schemaname='storage' and tablename='objects'
and (policyname like 'coral_receipts_%' or policyname like 'needs_photo_%') order by policyname;
