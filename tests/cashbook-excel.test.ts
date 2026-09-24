import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { cashbookWorkbook } from '../src/lib/cashbook-excel';
import {
  cashbookPeriodSummary,
  type CashbookReportInput,
  type CashbookReportTransaction,
} from '../src/lib/cashbook-domain';
import { dictionary, type Locale } from '../src/lib/i18n';

function transaction(
  id: string,
  options: Partial<CashbookReportTransaction> = {},
): CashbookReportTransaction {
  return {
    id,
    kind: 'INCOME',
    effective_date: '2026-09-24',
    amount_cents: 10000,
    source_account: null,
    destination_account: 'CASH',
    comment: 'Cash from customer',
    created_by: 'user-1',
    created_at: '2026-09-25T05:59:59Z',
    reverses_transaction_id: null,
    correction_of: null,
    original_kind: null,
    status: 'POSTED',
    creator_name: 'Jackie',
    ...options,
  };
}

function report(transactions: CashbookReportTransaction[]): CashbookReportInput {
  return {
    from: '2026-09-24',
    to: '2026-09-30',
    transactions,
    entries: transactions.flatMap((item) => [
      ...(item.source_account
        ? [
            {
              id: `${item.id}-out`,
              transaction_id: item.id,
              account: item.source_account,
              amount_cents: -Number(item.amount_cents),
            },
          ]
        : []),
      ...(item.destination_account
        ? [
            {
              id: `${item.id}-in`,
              transaction_id: item.id,
              account: item.destination_account,
              amount_cents: item.amount_cents,
            },
          ]
        : []),
    ]),
  };
}

const example = () =>
  report([
    transaction('opening-cash', {
      kind: 'OPENING',
      amount_cents: 50000,
      effective_date: '2026-09-23',
    }),
    transaction('opening-account', {
      kind: 'OPENING',
      amount_cents: 100000,
      effective_date: '2026-09-23',
      destination_account: 'ACCOUNT',
    }),
    transaction('income', { amount_cents: 100000 }),
    transaction('expense', {
      kind: 'EXPENSE',
      amount_cents: 50000,
      source_account: 'CASH',
      destination_account: null,
    }),
    transaction('transfer', {
      kind: 'TRANSFER',
      amount_cents: 30000,
      source_account: 'ACCOUNT',
      destination_account: 'CASH',
    }),
    transaction('food', {
      kind: 'PAYMENT',
      amount_cents: 26500,
      source_account: 'ACCOUNT',
      destination_account: null,
      payment_reference: 'food',
      comment: 'Weekly food orders',
    }),
    transaction('after-range', { effective_date: '2026-10-01', amount_cents: 999999 }),
  ]);

describe('Cashbook report reconciliation', () => {
  it('uses pre-range history for openings and separates transfers from income/expenses', () => {
    const summary = cashbookPeriodSummary(example());
    expect(summary.CASH).toEqual({
      openingCents: 50000,
      incomeCents: 100000,
      expenseCents: 50000,
      transferInCents: 30000,
      transferOutCents: 0,
      openingAdjustmentsCents: 0,
      closingCents: 130000,
    });
    expect(summary.ACCOUNT).toEqual({
      openingCents: 100000,
      incomeCents: 0,
      expenseCents: 26500,
      transferInCents: 0,
      transferOutCents: 30000,
      openingAdjustmentsCents: 0,
      closingCents: 43500,
    });
    expect(summary.openingTotalCents).toBe(150000);
    expect(summary.totalCents).toBe(173500);
  });
  it('retains void originals plus reversal legs, netting the original income/expense category', () => {
    const rows = [
      transaction('income', { status: 'VOIDED' }),
      transaction('undo-income', {
        kind: 'REVERSAL',
        original_kind: 'INCOME',
        reverses_transaction_id: 'income',
        source_account: 'CASH',
        destination_account: null,
      }),
      transaction('expense', {
        kind: 'EXPENSE',
        status: 'CORRECTED',
        amount_cents: 8000,
        source_account: 'ACCOUNT',
        destination_account: null,
      }),
      transaction('undo-expense', {
        kind: 'REVERSAL',
        original_kind: 'EXPENSE',
        reverses_transaction_id: 'expense',
        amount_cents: 8000,
        destination_account: 'ACCOUNT',
      }),
      transaction('fixed-expense', {
        kind: 'EXPENSE',
        correction_of: 'expense',
        amount_cents: 7000,
        source_account: 'ACCOUNT',
        destination_account: null,
      }),
    ];
    const summary = cashbookPeriodSummary(report(rows));
    expect(summary.CASH.incomeCents).toBe(0);
    expect(summary.CASH.closingCents).toBe(0);
    expect(summary.ACCOUNT.expenseCents).toBe(7000);
    expect(summary.totalCents).toBe(-7000);
  });
  it('handles reversals dated in a later period and keeps transfer reversals separate', () => {
    const rows = [
      transaction('old-income', { status: 'VOIDED', effective_date: '2026-09-23' }),
      transaction('undo-old-income', {
        kind: 'REVERSAL',
        original_kind: 'INCOME',
        reverses_transaction_id: 'old-income',
        source_account: 'CASH',
        destination_account: null,
      }),
      transaction('transfer', {
        kind: 'TRANSFER',
        status: 'VOIDED',
        source_account: 'CASH',
        destination_account: 'ACCOUNT',
      }),
      transaction('undo-transfer', {
        kind: 'REVERSAL',
        original_kind: 'TRANSFER',
        reverses_transaction_id: 'transfer',
        source_account: 'ACCOUNT',
        destination_account: 'CASH',
      }),
    ];
    const summary = cashbookPeriodSummary(report(rows));
    expect(summary.CASH.openingCents).toBe(10000);
    expect(summary.CASH.incomeCents).toBe(-10000);
    expect(summary.ACCOUNT.incomeCents).toBe(0);
    expect(summary.ACCOUNT.expenseCents).toBe(0);
    expect(summary.totalCents).toBe(0);
  });
  it('reports opening adjustments separately and includes both date endpoints', () => {
    const data = report([
      transaction('opening', { kind: 'OPENING', amount_cents: 5000 }),
      transaction('last-day', { effective_date: '2026-09-30', amount_cents: 29 }),
    ]);
    const summary = cashbookPeriodSummary(data);
    expect(summary.CASH.openingAdjustmentsCents).toBe(5000);
    expect(summary.CASH.incomeCents).toBe(29);
    expect(summary.totalCents).toBe(5029);
  });
  it('fails closed for incomplete/paginated, duplicate, unbalanced or unsafe input', () => {
    const input = example();
    expect(() => cashbookPeriodSummary({ ...input, entries: input.entries.slice(1) })).toThrow(
      'CASHBOOK_REPORT_INCOMPLETE',
    );
    expect(() =>
      cashbookPeriodSummary({ ...input, entries: [...input.entries, input.entries[0]] }),
    ).toThrow('CASHBOOK_REPORT_INCOMPLETE');
    expect(() =>
      cashbookPeriodSummary({
        ...input,
        transactions: [...input.transactions, input.transactions[0]],
      }),
    ).toThrow('CASHBOOK_REPORT_INCOMPLETE');
    expect(() =>
      cashbookPeriodSummary({
        ...input,
        entries: input.entries.map((entry) =>
          entry.id === 'transfer-in' ? { ...entry, amount_cents: 20000 } : entry,
        ),
      }),
    ).toThrow('CASHBOOK_REPORT_INCOMPLETE');
    expect(() =>
      cashbookPeriodSummary(report([transaction('unsafe', { amount_cents: '9007199254740992' })])),
    ).toThrow('CASHBOOK_AMOUNT');
  });
});

async function loadWorkbook(data: CashbookReportInput, locale: Locale = 'en') {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await cashbookWorkbook({ ...data, role: 'OWNER', locale })) as unknown as ExcelJS.Buffer,
  );
  return book;
}

describe('Owner Cashbook Excel export', () => {
  it('refuses a manager, including Jackie, at workbook generation', async () => {
    await expect(cashbookWorkbook({ ...example(), role: 'MANAGER', locale: 'en' })).rejects.toThrow(
      'FORBIDDEN',
    );
  });
  it.each(['en', 'es'] as const)(
    'writes localized %s summary and filtered native numeric transactions with linked settlement',
    async (locale) => {
      const t = dictionary(locale),
        book = await loadWorkbook(example(), locale);
      expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
        t.cashbookSummarySheet,
        t.cashbookTransactionsSheet,
      ]);
      const summary = book.worksheets[0],
        details = book.worksheets[1];
      expect(summary.getCell('B4').value).toBe(t.cashbookCash);
      expect(summary.getCell('C4').value).toBe(t.cashbookAccount);
      expect(summary.getCell('B5').value).toBe(500);
      expect(summary.getCell('C5').value).toBe(1000);
      expect(summary.getCell('B6').value).toBe(1000);
      expect(summary.getCell('B11').value).toBe(1300);
      expect(summary.getCell('C11').value).toBe(435);
      expect(summary.getCell('D11').value).toBe(1735);
      expect(details.rowCount).toBe(5);
      const rows = details.getRows(2, 4)!;
      const transfer = rows.find((row) => row.getCell(14).value === 'transfer')!;
      expect(transfer.getCell(6).value).toBeNull();
      expect(transfer.getCell(7).value).toBeNull();
      expect(transfer.getCell(8).value).toBe(300);
      expect(transfer.getCell(3).value).toBe(t.cashbookTransfer);
      const food = rows.find((row) => row.getCell(14).value === 'food')!;
      expect(food.getCell(7).value).toBe(265);
      expect(food.getCell(13).value).toBe('food');
      expect(food.getCell(10).value).toBe('Jackie (user-1)');
      expect(food.getCell(1).value).toEqual(new Date('2026-09-24T00:00:00Z'));
      expect(food.getCell(15).value).toEqual(new Date('2026-09-24T23:59:59Z'));
      expect(details.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
      expect(details.autoFilter).toBeTruthy();
    },
  );
  it('exports corrections with original references and treats comments as literal strings', async () => {
    const data = report([
      transaction('income', { status: 'VOIDED', comment: '=HYPERLINK("https://example.invalid")' }),
      transaction('reversal', {
        kind: 'REVERSAL',
        original_kind: 'INCOME',
        reverses_transaction_id: 'income',
        source_account: 'CASH',
        destination_account: null,
      }),
    ]);
    const details = (await loadWorkbook(data)).worksheets[1];
    expect(details.getCell('I2').value).toBe('=HYPERLINK("https://example.invalid")');
    expect(details.getCell('L2').value).toBe('reversal');
    expect(details.getCell('L3').value).toBe('income');
    expect(details.getCell('F3').value).toBe(-100);
  });
  it('retains references to corrections after the period without changing that period balance', async () => {
    const data = report([
      transaction('old-income', {
        status: 'CORRECTED',
        related_transaction_ids: ['later-reversal', 'later-correction'],
      }),
    ]);
    const book = await loadWorkbook(data);
    const summary = book.worksheets[0],
      details = book.worksheets[1];
    expect(summary.getCell('B11').value).toBe(100);
    expect(details.rowCount).toBe(2);
    expect(details.getCell('K2').value).toBe(dictionary('en').cashbookCorrected);
    expect(details.getCell('L2').value).toBe('later-reversal, later-correction');
  });
});
