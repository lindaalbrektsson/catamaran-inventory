import ExcelJS from 'exceljs';
import { units } from './domain';
import { dictionary, en, type Locale } from './i18n';
import type { ItemCatalog, ItemInput } from './item-domain';
// Stable English interchange headers are shared with the translation dictionary.
export const columns = [
  en.itemName,
  en.category,
  en.itemUnit,
  en.itemLocation,
  en.itemMinimum,
  en.itemTarget,
  en.itemInitialQuantity,
  en.itemNotes,
] as const;
// Bound decompression before handing an untrusted ZIP archive to ExcelJS.
function checkZip(bytes: Buffer) {
  if (bytes.length > 1024 * 1024) throw new Error('ITEM_FILE');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('ITEM_FILE');
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16),
    size = 0;
  if (count > 1000) throw new Error('ITEM_FILE');
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50)
      throw new Error('ITEM_FILE');
    size += bytes.readUInt32LE(at + 24);
    if (size > 10 * 1024 * 1024) throw new Error('ITEM_FILE');
    at +=
      46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
}
export async function parseItems(bytes: Buffer, catalog: ItemCatalog): Promise<ItemInput[]> {
  checkZip(bytes);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount > 201 || sheet.columnCount > columns.length)
    throw new Error('ITEM_FILE');
  if (columns.some((c, i) => sheet.getCell(1, i + 1).value !== c)) throw new Error('ITEM_FILE');
  const text = (row: number, col: number) => {
    const value = sheet.getCell(row, col).value;
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '__INVALID_CELL__';
    return String(value).trim();
  };
  const result: ItemInput[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const v = columns.map((_, i) => text(r, i + 1));
    if (v.every((x) => !x)) continue;
    const category = catalog.categories.filter((c) =>
      [c.name_en.toLowerCase(), c.name_es.toLowerCase()].includes(v[1].toLowerCase()),
    );
    const location = catalog.locations.filter((l) => l.name.toLowerCase() === v[3].toLowerCase());
    // Cost fields are retained only for compatibility with existing stored metadata.
    const existing = catalog.products.find(
      (p) => p.name.trim().toLowerCase() === v[0].toLowerCase(),
    );
    result.push({
      sourceRow: r,
      name: v[0],
      category: category.length === 1 ? category[0].id : '',
      unit: v[2] as ItemInput['unit'],
      location: location.length === 1 ? location[0].id : '',
      minimum: v[4],
      target: v[5],
      cost: existing?.estimated_unit_cost?.toString() ?? '',
      currency: existing?.cost_currency ?? 'BZD',
      quantity: v[6],
      notes: v[7],
      active: true,
      mode: 'create',
    });
  }
  if (!result.length) throw new Error('ITEM_FILE');
  return result;
}
export async function itemWorkbook(catalog: ItemCatalog, locale: Locale, rows?: unknown[][]) {
  const t = dictionary(locale),
    book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t.itemSheet);
  sheet.addRow(rows ? [...columns.slice(0, 6), t.currentQuantity, columns[7]] : [...columns]);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((c, i) => {
    c.width = i === 0 || i === 7 ? 32 : 23;
  });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B5B' } };
  if (rows) for (const row of rows) sheet.addRow(row);
  const instructions = book.addWorksheet(t.itemInstructions);
  instructions.getColumn(1).width = 100;
  instructions.addRow([t.itemExcelHint]);
  instructions.addRow([t.itemExportHint]);
  instructions.addRow([
    t.category,
    ...catalog.categories.map((c) => (locale === 'es' ? c.name_es : c.name_en)),
  ]);
  instructions.addRow([t.itemUnit, ...units]);
  instructions.addRow([t.itemLocation, ...catalog.locations.map((l) => l.name)]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
