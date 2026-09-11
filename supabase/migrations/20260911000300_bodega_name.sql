-- Rename the current V1 location in place; preserve identity, balances and history.
update public.locations set name='Bodega'
where id='10000000-0000-4000-8000-000000000003'
and name is distinct from 'Bodega';
