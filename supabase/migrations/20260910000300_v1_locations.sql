-- Retire the mistakenly seeded external location without deleting history.
-- Stable catalog IDs only: future user-created boats/storage remain supported.
update public.locations set active=false
where id='10000000-0000-4000-8000-000000000002' and active;

update public.locations set name='Bodega / Storage'
where id='10000000-0000-4000-8000-000000000003'
and name is distinct from 'Bodega / Storage';
