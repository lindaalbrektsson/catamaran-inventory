import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import {
  itemSchema,
  validateItems,
  type ItemInput,
  type ItemCatalog,
} from '../src/lib/item-domain';
import { itemWorkbook, parseItems } from '../src/lib/item-excel';
import ExcelJS from 'exceljs';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002',
  crew = '40000000-0000-4000-8000-000000000003';
const value: ItemInput = {
  name: 'Test item',
  category: '20000000-0000-4000-8000-000000000001',
  unit: 'piece',
  location: '10000000-0000-4000-8000-000000000001',
  minimum: '2',
  target: '5',
  cost: '1.25',
  currency: 'BZD',
  quantity: '',
  notes: '',
  active: true,
  mode: 'create',
};
let catalog: ItemCatalog;
async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const save = (rows: ItemInput[], id = crypto.randomUUID()) =>
  db.query('select public.save_inventory_items($1,$2)', [id, JSON.stringify(rows)]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const file of ['20260909000100_inventory.sql', '20260910000400_item_import.sql'])
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [manager, 'MANAGER'],
    [crew, 'CREW'],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('update public.profiles set role=$1,active=true where id=$2', [role, id]);
  }
  catalog = {
    categories: (await db.query('select * from public.categories')).rows,
    locations: (await db.query('select * from public.locations')).rows,
    products: (await db.query('select * from public.products')).rows,
  } as ItemCatalog;
});
beforeEach(async () => {
  await db.exec('begin');
  await user(owner);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());
it.each([owner, manager])('creates a zero-stock item for authorized role %s', async (id) => {
  await user(id);
  await save([value]);
  expect(
    (
      await db.query(
        "select quantity from public.inventory_balances b join public.products p on p.id=b.product_id where p.name='Test item'",
      )
    ).rows,
  ).toEqual([{ quantity: '0.000' }]);
});
it.each([crew, ''])('rejects unauthorized callers %s', async (id) => {
  await user(id);
  await expect(save([value])).rejects.toThrow('FORBIDDEN');
});
it('rejects captains and inactive owners at the RPC boundary', async () => {
  await db.exec('reset role');
  await db.query("update public.profiles set role='CAPTAIN' where id=$1", [crew]);
  await user(crew);
  await db.exec('savepoint attempt');
  await expect(save([value])).rejects.toThrow('FORBIDDEN');
  await db.exec('rollback to savepoint attempt');
  await db.exec('reset role');
  await db.query('update public.profiles set active=false where id=$1', [owner]);
  await user(owner);
  await expect(save([value])).rejects.toThrow('FORBIDDEN');
});
it('records initial quantity via stock RPC with actor and audit, and retries once', async () => {
  const id = crypto.randomUUID();
  const rows = [{ ...value, quantity: '3.125' }];
  await save(rows, id);
  await save(rows, id);
  const movements = (
    await db.query(
      'select quantity,reason,notes,performed_by_user_id from public.inventory_transactions',
    )
  ).rows;
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({
    quantity: '3.125',
    reason: 'other',
    performed_by_user_id: owner,
  });
  expect(String((movements[0] as { notes: string }).notes)).toContain('INITIAL_IMPORT');
  expect((await db.query('select * from public.audit_events')).rows.length).toBeGreaterThan(0);
});
it('rolls back the whole batch on a later invalid location', async () => {
  await db.exec('savepoint attempt');
  await expect(
    save([
      { ...value, quantity: '3' },
      { ...value, name: 'Second', location: '10000000-0000-4000-8000-000000000099' },
    ]),
  ).rejects.toThrow();
  await db.exec('rollback to savepoint attempt');
  expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(0);
  expect(
    (await db.query("select * from public.products where name='Test item'")).rows,
  ).toHaveLength(0);
});
it('metadata updates and skips never overwrite stock', async () => {
  await save([{ ...value, quantity: '4' }]);
  await save([{ ...value, mode: 'update', minimum: '3' }]);
  await save([{ ...value, mode: 'skip', quantity: '10' }]);
  expect((await db.query('select quantity from public.inventory_balances')).rows).toEqual([
    { quantity: '4.000' },
  ]);
});
it('rejects duplicate names and initial quantity on metadata update', async () => {
  await save([value]);
  await db.exec('savepoint attempt');
  await expect(save([value])).rejects.toThrow('ITEM_DUPLICATE');
  await db.exec('rollback to savepoint attempt');
  await expect(save([{ ...value, mode: 'update', quantity: '1' }])).rejects.toThrow(
    'ITEM_STOCK_CONFLICT',
  );
});
it('validates row errors and duplicate names', () => {
  expect(itemSchema.safeParse({ ...value, minimum: '-1' }).success).toBe(false);
  expect(validateItems([value, { ...value }], catalog)[0].errors).toContain('ITEM_DUPLICATE');
  expect(validateItems([{ ...value, location: '' }], catalog)[0].errors).toContain('ITEM_INVALID');
});
it('generates and parses a real xlsx template with instructions and current locations', async () => {
  const bytes = await itemWorkbook(catalog, 'en');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  expect(book.worksheets).toHaveLength(2);
  book.worksheets[0].addRow(['New item', 'Bar', 'piece', 'Cas Cat', 2, 5, 1.25, 'BZD', 3, '']);
  const values = await parseItems(Buffer.from(await book.xlsx.writeBuffer()), catalog);
  expect(validateItems(values, catalog)[0].errors).toEqual([]);
  expect(values[0].quantity).toBe('3');
});
it('flags formulas and unknown categories instead of using cached results', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await itemWorkbook(catalog, 'en')) as unknown as ExcelJS.Buffer);
  book.worksheets[0].addRow([
    'New item',
    'Missing',
    'piece',
    'Cas Cat',
    0,
    0,
    { formula: '1+1', result: 2 },
    'BZD',
    0,
    '',
  ]);
  const rows = await parseItems(Buffer.from(await book.xlsx.writeBuffer()), catalog);
  expect(validateItems(rows, catalog)[0].errors).toContain('ITEM_INVALID');
});
