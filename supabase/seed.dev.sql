-- OPTICOR — DEV project only: test stores and lab (Stores CRUD arrives in phase 5).
-- Never run on production. Idempotent.

insert into public.stores (name, kind, prefix) values
  ('Succursale Centre', 'store', 'CNT'),
  ('Succursale Maârif', 'store', 'MRF'),
  ('Laboratoire',       'lab',   'LAB')
on conflict (prefix) do nothing;
