-- Optional catalog only. No users, passwords, or fictitious stock balances.
insert into public.locations(id,name,type) values
('10000000-0000-4000-8000-000000000001','Cas Cat','BOAT'),
('10000000-0000-4000-8000-000000000002','Oxford / Roan','BOAT'),
('10000000-0000-4000-8000-000000000003','Storage / Bodega','STORAGE') on conflict do nothing;
insert into public.categories(id,name_en,name_es) values
('20000000-0000-4000-8000-000000000001','Bar','Bar'),
('20000000-0000-4000-8000-000000000002','Food','Comida'),
('20000000-0000-4000-8000-000000000003','Boat supplies','Suministros del barco'),
('20000000-0000-4000-8000-000000000004','Snorkeling','Esnórquel'),
('20000000-0000-4000-8000-000000000005','Maintenance','Mantenimiento') on conflict do nothing;
insert into public.products(id,name,category_id,unit) values
('30000000-0000-4000-8000-000000000001','Belikin Beer','20000000-0000-4000-8000-000000000001','bottle'),
('30000000-0000-4000-8000-000000000002','Rum','20000000-0000-4000-8000-000000000001','bottle'),
('30000000-0000-4000-8000-000000000003','Coca-Cola','20000000-0000-4000-8000-000000000001','can'),
('30000000-0000-4000-8000-000000000004','Water','20000000-0000-4000-8000-000000000001','bottle'),
('30000000-0000-4000-8000-000000000005','Ice','20000000-0000-4000-8000-000000000001','pack'),
('30000000-0000-4000-8000-000000000006','Paper Towels','20000000-0000-4000-8000-000000000003','roll'),
('30000000-0000-4000-8000-000000000007','Trash Bags','20000000-0000-4000-8000-000000000003','pack'),
('30000000-0000-4000-8000-000000000008','Snorkel Masks','20000000-0000-4000-8000-000000000004','piece') on conflict do nothing;
insert into public.inventory_balances(product_id,location_id)
select p.id,l.id from public.products p cross join public.locations l on conflict do nothing;
