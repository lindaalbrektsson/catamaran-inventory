import ExcelJS from 'exceljs';
import type { Role } from './domain';
import { dictionary, type Locale } from './i18n';
import {
  cashbookPeriodSummary,
  cashbookReportCategory,
  safeMinor,
  sumMinor,
  type CashbookReportInput,
  type CashbookReportAccount,
} from './cashbook-domain';

type CashbookWorkbookInput = CashbookReportInput & { role: Role; locale: Locale };
const moneyFormat = '"BZD "#,##0.00;[Red]("BZD "#,##0.00);"BZD "0.00';

function header(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B5B' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
}

// Date-only values stay dates, rather than UTC instants reformatted by a client timezone.
const excelDate = (value: string) => new Date(`${value}T00:00:00Z`);
function belizeRecordedDate(timestamp: string) {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) throw new Error('CASHBOOK_DATE');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belize',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return new Date(
    `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}Z`,
  );
}

// Called only after server authentication. Checking role again prevents accidental reuse
// from a Jackie path. The mobile UI does not offer this desktop export operation.
export async function cashbookWorkbook(input: CashbookWorkbookInput) {
  if (input.role !== 'OWNER') throw new Error('FORBIDDEN');
  const t = dictionary(input.locale),
    summary = cashbookPeriodSummary(input);
  const book = new ExcelJS.Workbook();
  book.creator = 'Catamaran Belize';
  book.title = t.cashbook;
  const overview = book.addWorksheet(t.cashbookSummarySheet);
  overview.columns = [{ width: 34 }, { width: 25 }, { width: 25 }, { width: 25 }];
  overview.mergeCells('A1:D1');
  overview.getCell('A1').value = `${t.cashbook} — BZD`;
  overview.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF176B5B' } };
  overview.getRow(1).height = 32;
  overview.addRow([t.cashbookExportPeriod, excelDate(input.from), excelDate(input.to)]);
  overview.getCell('B2').numFmt = 'yyyy-mm-dd';
  overview.getCell('C2').numFmt = 'yyyy-mm-dd';
  overview.addRow([]);
  header(overview.addRow(['', t.cashbookCash, t.cashbookAccount, t.cashbookTotal]));
  const summaryRows = [
    [t.cashbookExportOpening, 'openingCents'],
    [t.cashbookExportIncome, 'incomeCents'],
    [t.cashbookExportExpense, 'expenseCents'],
    [t.cashbookExportTransfersIn, 'transferInCents'],
    [t.cashbookExportTransfersOut, 'transferOutCents'],
    [t.cashbookExportOpeningAdjustments, 'openingAdjustmentsCents'],
    [t.cashbookExportClosing, 'closingCents'],
  ] as const;
  for (const [label, field] of summaryRows) {
    // Transfer totals are omitted at fund level: both account legs are shown separately.
    const total = field.startsWith('transfer')
      ? null
      : sumMinor([summary.CASH[field], summary.ACCOUNT[field]]) / 100;
    const row = overview.addRow([
      label,
      summary.CASH[field] / 100,
      summary.ACCOUNT[field] / 100,
      total,
    ]);
    for (let column = 2; column <= 4; column++) row.getCell(column).numFmt = moneyFormat;
    if (field === 'closingCents') {
      row.font = { bold: true };
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF176B5B' } } };
      });
    }
  }
  overview.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  overview.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  const details = book.addWorksheet(t.cashbookTransactionsSheet);
  header(
    details.addRow([
      t.cashbookExportDate,
      t.cashbookExportTime,
      t.cashbookExportType,
      t.cashbookExportAccount,
      t.cashbookExportDestination,
      t.cashbookExportIncome,
      t.cashbookExportExpense,
      t.cashbookExportAmount,
      t.cashbookExportComment,
      t.cashbookExportCreatedBy,
      t.cashbookExportStatus,
      t.cashbookExportCorrectionRef,
      t.cashbookExportPaymentRef,
      t.cashbookExportId,
      t.cashbookExportCreatedAt,
    ]),
  );
  details.columns.forEach((column, index) => {
    column.width = index >= 8 ? 38 : index === 0 ? 15 : 24;
  });
  details.getColumn(2).width = 17;
  details.getColumn(15).width = 25;
  details.views = [{ state: 'frozen', ySplit: 1 }];
  const accountLabel = (account: CashbookReportAccount | null) =>
    account === 'CASH' ? t.cashbookCash : account === 'ACCOUNT' ? t.cashbookAccount : '';
  const kinds = {
    INCOME: t.cashbookIncome,
    EXPENSE: t.cashbookExpense,
    TRANSFER: t.cashbookTransfer,
    OPENING: t.cashbookOpening,
    PAYMENT: t.cashbookPayment,
    REVERSAL: t.cashbookReversal,
  };
  const statuses = {
    POSTED: t.cashbookPosted,
    VOIDED: t.cashbookVoided,
    CORRECTED: t.cashbookCorrected,
  };
  const entries = new Map<string, (number | string)[]>();
  const corrections = new Map<string, string[]>();
  for (const entry of input.entries) {
    const amounts = entries.get(entry.transaction_id) ?? [];
    amounts.push(entry.amount_cents);
    entries.set(entry.transaction_id, amounts);
  }
  for (const transaction of input.transactions) {
    const original = transaction.reverses_transaction_id ?? transaction.correction_of;
    if (!original) continue;
    const related = corrections.get(original) ?? [];
    related.push(transaction.id);
    corrections.set(original, related);
  }
  const transactions = input.transactions
    .filter(
      (transaction) =>
        transaction.effective_date >= input.from && transaction.effective_date <= input.to,
    )
    .sort(
      (a, b) =>
        a.effective_date.localeCompare(b.effective_date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  for (const transaction of transactions) {
    const category = cashbookReportCategory(transaction);
    const net = sumMinor(entries.get(transaction.id) ?? []);
    const recorded = belizeRecordedDate(transaction.created_at);
    const amount =
      category === 'TRANSFER'
        ? safeMinor(transaction.amount_cents) * (transaction.kind === 'REVERSAL' ? -1 : 1)
        : net;
    const row = details.addRow([
      excelDate(transaction.effective_date),
      recorded,
      kinds[transaction.kind],
      accountLabel(transaction.source_account ?? transaction.destination_account),
      category === 'TRANSFER' ? accountLabel(transaction.destination_account) : '',
      category === 'INCOME' ? net / 100 : null,
      category === 'EXPENSE' || category === 'PAYMENT' ? -net / 100 : null,
      amount / 100,
      transaction.comment,
      transaction.creator_name
        ? `${transaction.creator_name} (${transaction.created_by})`
        : transaction.created_by,
      statuses[transaction.status],
      transaction.reverses_transaction_id ??
        transaction.correction_of ??
        transaction.related_transaction_ids?.join(', ') ??
        corrections.get(transaction.id)?.join(', ') ??
        '',
      transaction.payment_reference ?? '',
      transaction.id,
      recorded,
    ]);
    row.getCell(1).numFmt = 'yyyy-mm-dd';
    row.getCell(2).numFmt = 'hh:mm:ss';
    row.getCell(15).numFmt = 'yyyy-mm-dd hh:mm:ss';
    for (const column of [6, 7, 8]) row.getCell(column).numFmt = moneyFormat;
    for (let column = 9; column <= 13; column++)
      row.getCell(column).alignment = { wrapText: true, vertical: 'top' };
    row.height = 32;
  }
  details.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, details.rowCount), column: 15 },
  };
  details.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
  };
  return Buffer.from(await book.xlsx.writeBuffer());
}
