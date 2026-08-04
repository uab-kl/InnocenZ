import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { PrTable } from '@/features/pr/pr.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { prepareLine } from './payment-voucher-component';
import {
  assignmentIdFromRef,
  checkLineAgainstShift,
  isSameOrderNo,
  LineDateConflictError,
} from './payment-voucher-audit';
import {
  PaymentVoucherDayReviewTable,
  PaymentVoucherDayReviewType,
  PaymentVoucherDayReviewStatus,
  PaymentVoucherDisputeTable,
  PaymentVoucherReceiptStatus,
} from './payment-voucher.model';
import {
  PaymentVoucherTable,
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherInsertType,
  PaymentVoucherLineInsertType,
  PaymentVoucherReceiptInsertType,
  PaymentVoucherReceiptType,
  PaymentVoucherType,
  PaymentVoucherLineType,
  PaymentVoucherWithLines,
  PaymentVoucherFilter,
  PaymentVoucherStatus,
} from './payment-voucher.model';

type LineInput = Omit<PaymentVoucherLineInsertType, 'id' | 'voucherId'>;
type ReceiptInput = Omit<
  PaymentVoucherReceiptInsertType,
  'id' | 'receiptNo' | 'createdAt' | 'updatedAt'
>;

/** How many times the allocator retries past a taken number before giving up. */
const VOUCHER_NO_ATTEMPTS = 20;

/**
 * Is this the unique-index violation on `voucher_no`, and nothing else?
 *
 * Narrow on purpose: a retry loop that catches every error would turn a real
 * fault into twenty silent attempts and then an unnumbered voucher. drizzle
 * wraps the driver error, so the pg code is read from `.cause` as well as the
 * error itself — see the drizzle 0.45 note in the migration memo.
 */
function isVoucherNoConflict(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((e) => {
    const err = e as { code?: string; constraint?: string; message?: string } | null;
    if (!err || err.code !== '23505') return false;
    const where = `${err.constraint ?? ''} ${err.message ?? ''}`;
    return where.includes('voucher_no');
  });
}

export class PaymentVoucherRepositoryClass {
  /**
   * The next voucher number — `PV-000001`, in the same shape as the receipt
   * numbers this schema already issues.
   *
   * count()+bump rather than max()+1 for the same reason `createReceiptWithLines`
   * uses it: it needs no parsing of the stored string. The unique index is what
   * actually guarantees correctness — two vouchers raised in the same moment both
   * compute the same candidate, one insert loses, and the caller retries with the
   * next. Returning null after that many attempts leaves the voucher unnumbered
   * rather than failing to create it: an unnumbered voucher can be repaired, an
   * uncreated one is somebody's missing pay.
   */
  /**
   * REFUSES a line whose date contradicts the shift its own `ref` names.
   *
   * This is the write-time half of the rule `auditVoucher` already reports as
   * `line_date_contradicts_shift`. Until now the rule only DETECTED: the
   * generator and `audit-live-vouchers` could tell you a voucher was wrong after
   * it existed, and nothing stopped it being written. The live fault it exists
   * to stop was wages dated 2026-07-28 whose ref named the 23 Jul assignment —
   * both dates sit in the same week, so `checkLineAgainstWeek` passed it. The
   * line carried its own evidence and nothing compared the two.
   *
   * It lives HERE, not in the controller, because all four insert paths
   * (`create`, `update`'s delete-and-reinsert, `createReceiptWithLines`,
   * `addLine`) funnel through `prepareLine`, and a controller-side check would
   * cover only the HTTP ones — leaving the PR self-log and the weekly generator
   * writing unchecked money. Same reasoning as the component classification in
   * [[pv-money-classification]]: one rule, applied where every path meets.
   *
   * Runs INSIDE the caller's transaction so the read cannot see a shift that a
   * concurrent write has since moved, and so a refusal rolls the whole write
   * back rather than leaving a half-written voucher.
   *
   * Lines whose ref names no assignment (a scanned drink, `ORD0389:0`) and refs
   * naming an assignment we cannot find are both passed deliberately — see
   * `checkLineAgainstShift`. Refusing on an unknown id would turn a missing join
   * into a failed payroll write.
   */
  private async assertLinesAgreeWithShifts(
    tx: DbTransaction,
    lines: ReadonlyArray<{ lineDate?: string | null; ref?: string | null }>,
  ): Promise<void> {
    const ids = [
      ...new Set(
        lines.map((line) => assignmentIdFromRef(line.ref)).filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return;

    const rows = await tx
      .select({ id: ShiftAssignmentTable.id, shiftDate: ShiftTable.shiftDate })
      .from(ShiftAssignmentTable)
      .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
      .where(inArray(ShiftAssignmentTable.id, ids));

    const shiftDateById = new Map(rows.map((row) => [row.id.toLowerCase(), row.shiftDate]));
    for (const line of lines) {
      const reason = checkLineAgainstShift(line.lineDate, line.ref, shiftDateById);
      if (reason) throw new LineDateConflictError(reason);
    }
  }

  private async nextVoucherNo(tx: DbTransaction, bump: number): Promise<string> {
    // MAX of the numeric suffix, not count(*). The original used count()+bump to
    // avoid parsing the stored string, which is true and was still wrong: a count
    // RECYCLES numbers after any delete. Proven live on 31 Jul — deleting three
    // vouchers dropped the count from 5 to 2, so the next voucher was issued
    // `PV-000002`, the number a previously-`sent` document had held, and the one
    // after that collided with the existing `PV-000003` outright.
    //
    // A recycled voucher number is worse than an ugly one: PV-000002 appears in
    // an export a PR already downloaded, so two different documents answer to the
    // same name and nothing in a support conversation can tell them apart.
    //
    // Non-conforming values (NULL, or anything with no digits) become NULL and are
    // ignored by max(), so one malformed row cannot stall numbering forever.
    const [row] = await tx
      .select({
        highest: sql<number>`coalesce(max(nullif(regexp_replace(${PaymentVoucherTable.voucherNo}, '\\D', '', 'g'), '')::int), 0)`,
      })
      .from(PaymentVoucherTable);
    return `PV-${String(Number(row?.highest ?? 0) + bump).padStart(6, '0')}`;
  }

  async create(
    data: Omit<PaymentVoucherInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    lines: LineInput[],
  ): Promise<PaymentVoucherWithLines> {
    try {
      const created = await db.transaction(async (tx) => {
        // A number is allocated here, once, so no reader ever has to invent one.
        let voucher: PaymentVoucherType | undefined;
        for (let bump = 1; bump <= VOUCHER_NO_ATTEMPTS && !voucher; bump++) {
          const voucherNo = await this.nextVoucherNo(tx, bump);
          try {
            // SAVEPOINT per attempt (drizzle's nested transaction), and it is
            // load-bearing rather than tidiness. In PostgreSQL a failed statement
            // aborts the WHOLE transaction: without this, the first number clash
            // poisoned `tx`, the next iteration's own SELECT came back 25P02
            // "current transaction is aborted", and because 25P02 is not a
            // voucher-no conflict it was rethrown — so the retry loop could never
            // reach attempt 2 and every caller saw a confusing error about a
            // COUNT query. Found live on 31 Jul when regenerating a wiped week.
            voucher = await tx.transaction(async (sp) => {
              const [row] = await sp
                .insert(PaymentVoucherTable)
                .values({ ...data, voucherNo })
                .returning();
              return row;
            });
          } catch (conflict) {
            // Only a number clash is retryable; anything else is a real fault
            // and must not be swallowed into 19 more attempts.
            if (!isVoucherNoConflict(conflict)) throw conflict;
          }
        }
        if (!voucher) {
          logger.warn(
            '[PaymentVoucherRepository.create] Could not allocate a voucher number; creating unnumbered',
          );
          [voucher] = await tx.insert(PaymentVoucherTable).values(data).returning();
        }
        await this.assertLinesAgreeWithShifts(tx, lines);
        const insertedLines =
          lines.length > 0
            ? await tx
                .insert(PaymentVoucherLineTable)
                .values(
                  lines.map((line, i) =>
                    prepareLine({ ...line, voucherId: voucher.id, sortOrder: i }),
                  ),
                )
                .returning()
            : [];
        return { ...voucher, lines: insertedLines };
      });
      logger.info('[PaymentVoucherRepository.create] Voucher created:', created.id);
      return created;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.create] Error:', error);
      throw error;
    }
  }

  /** Updates the header; when `lines` is provided the line set is replaced wholesale. */
  async update(
    id: string,
    data: Partial<PaymentVoucherInsertType>,
    lines?: LineInput[],
  ): Promise<PaymentVoucherWithLines | null> {
    try {
      return await db.transaction(async (tx) => {
        const [voucher] = await tx
          .update(PaymentVoucherTable)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(PaymentVoucherTable.id, id))
          .returning();
        // Empty result => row not found (a genuine null); a real DB error re-throws below.
        if (!voucher) return null;

        if (lines) {
          // Carry evidence across the wipe-and-reinsert.
          //
          // Replacing the line set is how every voucher update works, and the
          // HTTP payload carries no receipt_id and no proof_photos — so before
          // this, an agency editing one amount silently NULLed the receipt link on
          // every line of the voucher and DELETED the PR's proof photos, the
          // mandatory evidence behind a self-logged claim. The verify panel then
          // reported every commission line as unbacked, because it was.
          //
          // Matched on `ref`, which encodes kind|source|amount|order and is what a
          // client round-trips unchanged while editing a price. Only refs that
          // appear EXACTLY ONCE are carried: an ambiguous match would attach a
          // receipt to the wrong money, which is worse than the null it replaces.
          const previous = await this.getLines(id, tx);
          const carryable = new Map<
            string,
            { receiptId: string | null; proofPhotos: string[] | null }
          >();
          const refCounts = new Map<string, number>();
          for (const line of previous) {
            if (!line.ref) continue;
            refCounts.set(line.ref, (refCounts.get(line.ref) ?? 0) + 1);
            carryable.set(line.ref, {
              receiptId: line.receiptId,
              proofPhotos: line.proofPhotos,
            });
          }
          for (const [ref, count] of refCounts) if (count > 1) carryable.delete(ref);

          // Before the delete, not after: this path wipes and re-inserts every
          // line, so a refusal that landed mid-way would leave the voucher with
          // no lines at all.
          await this.assertLinesAgreeWithShifts(tx, lines);
          await tx.delete(PaymentVoucherLineTable).where(eq(PaymentVoucherLineTable.voucherId, id));
          const insertedLines =
            lines.length > 0
              ? await tx
                  .insert(PaymentVoucherLineTable)
                  .values(
                    lines.map((line, i) => {
                      const carried = line.ref ? carryable.get(line.ref) : undefined;
                      return prepareLine({
                        ...line,
                        // An explicit value from the caller always wins; this only
                        // fills in what the HTTP payload cannot express.
                        receiptId: line.receiptId ?? carried?.receiptId ?? null,
                        proofPhotos: line.proofPhotos ?? carried?.proofPhotos ?? null,
                        voucherId: id,
                        sortOrder: i,
                      });
                    }),
                  )
                  .returning()
              : [];
          return { ...voucher, lines: insertedLines };
        }

        const existingLines = await this.getLines(id, tx);
        return { ...voucher, lines: existingLines };
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(eq(PaymentVoucherTable.id, id))
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getById] Error:', error);
      throw error;
    }
  }

  /**
   * The receipts behind a voucher — the evidence the agency verifies a week's
   * commission against.
   *
   * Deliberately NOT folded into getById: the PR `/mine/*` paths read that on
   * every poll and do not need receipts, so this stays a second call the agency
   * detail route makes explicitly.
   */
  async listReceipts(voucherId: string): Promise<PaymentVoucherReceiptType[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherReceiptTable)
        .where(eq(PaymentVoucherReceiptTable.voucherId, voucherId))
        .orderBy(PaymentVoucherReceiptTable.receiptNo);
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listReceipts] Error:', error);
      // Fails closed: no evidence shown beats wrong evidence shown.
      return [];
    }
  }

  private async getLines(voucherId: string, tx?: DbTransaction) {
    const dbClient = tx ?? db;
    return dbClient
      .select()
      .from(PaymentVoucherLineTable)
      .where(eq(PaymentVoucherLineTable.voucherId, voucherId))
      .orderBy(PaymentVoucherLineTable.sortOrder);
  }

  async listPaginated(params: {
    filter?: PaymentVoucherFilter;
    page: number;
    pageSize: number;
  }): Promise<{ vouchers: PaymentVoucherType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(PaymentVoucherTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(PaymentVoucherTable.agencyId, filter.agencyId));
      if (filter?.prId) conditions.push(eq(PaymentVoucherTable.prId, filter.prId));
      if (filter?.status) conditions.push(eq(PaymentVoucherTable.status, filter.status));
      if (filter?.prName) conditions.push(ilike(PaymentVoucherTable.prName, `%${filter.prName}%`));
      if (filter?.fromDate) conditions.push(gte(PaymentVoucherTable.issuedDate, filter.fromDate));
      if (filter?.toDate) conditions.push(lte(PaymentVoucherTable.issuedDate, filter.toDate));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(PaymentVoucherTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const vouchers = await db
        .select()
        .from(PaymentVoucherTable)
        .where(whereClause)
        .orderBy(PaymentVoucherTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { vouchers, totalCount };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Whether a voucher already exists for this PR + week (idempotency guard for
   * the weekly generation job, so re-running never double-pays).
   */
  /**
   * Does this PR already have a voucher covering ANY DAY of the given window?
   *
   * Matches on OVERLAP, not on `week_start` equality, and that distinction is
   * the whole point. On 3 Aug 2026 a stale backend process wrote a self-logged
   * voucher anchored Mon–Sun (`2026-08-03`) while the generator asked for the
   * Sun–Sat week (`2026-08-02`). Two different strings, so the old equality
   * check saw no clash and minted a SECOND voucher — the same assignment billed
   * twice, RM700 each, for one shift. Equality only ever protected against a
   * repeat from the SAME writer using the SAME anchor; the moment two paths
   * disagreed by a single day it silently stopped protecting anything.
   *
   * Overlap holds regardless of anchor, so a future timezone slip, a manual
   * re-anchor, or a third write path cannot reopen double-billing.
   *
   * `weekEnd` defaults to `weekStart`, which degrades to "is this DATE inside an
   * existing voucher's week" — still strictly stronger than equality, and it is
   * what the create-voucher endpoint needs, where `weekEnd` is optional.
   *
   * The exact-`week_start` arm is kept as well: a legacy row with a NULL
   * `week_end` cannot satisfy the range test, and dropping it would have made
   * this guard weaker than the one it replaces for exactly those rows.
   */
  async existsForPrWeek(
    agencyId: string,
    prId: string,
    weekStart: string,
    weekEnd: string = weekStart,
  ): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: PaymentVoucherTable.id })
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.agencyId, agencyId),
            eq(PaymentVoucherTable.prId, prId),
            or(
              eq(PaymentVoucherTable.weekStart, weekStart),
              and(
                lte(PaymentVoucherTable.weekStart, weekEnd),
                gte(PaymentVoucherTable.weekEnd, weekStart),
              ),
            ),
          ),
        )
        .limit(1);
      return !!row;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.existsForPrWeek] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db
        .delete(PaymentVoucherTable)
        .where(eq(PaymentVoucherTable.id, id))
        .returning({ id: PaymentVoucherTable.id });
      // No row => not found; a real DB error re-throws below. Lines cascade.
      return !!row;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.remove] Error:', error);
      throw error;
    }
  }

  // --- PR current-week draft voucher + line-level ops -----------------------
  // A PR accumulates a week's earnings on ONE pending_review voucher (the draft
  // the weekly generator would otherwise create — existsForPrWeek makes the two
  // idempotent). Each self-log / wages seal is a single line on it.

  /** The PR's current-week draft voucher (pending_review) with its lines, or null. */
  async getCurrentWeekDraft(prId: string, weekStart: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
            eq(PaymentVoucherTable.status, 'pending_review'),
          ),
        )
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(voucher.id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getCurrentWeekDraft] Error:', error);
      throw error;
    }
  }

  /**
   * The PR's voucher for a given week regardless of status (draft, sent,
   * signed, paid…) with its lines — used for the Payment "Last week" view. The
   * most recently created one wins if more than one exists.
   */
  async getWeekVoucher(prId: string, weekStart: string): Promise<PaymentVoucherWithLines | null> {
    try {
      const [voucher] = await db
        .select()
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.prId, prId),
            eq(PaymentVoucherTable.weekStart, weekStart),
          ),
        )
        .orderBy(desc(PaymentVoucherTable.createdAt))
        .limit(1);
      if (!voucher) return null;
      const lines = await this.getLines(voucher.id);
      return { ...voucher, lines };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getWeekVoucher] Error:', error);
      throw error;
    }
  }

  /**
   * Signed/paid vouchers for the PR History → Payment tab (and payroll weeks
   * on History → Shifts). Newest week first. Optional `statuses` defaults to
   * signed + paid; pass past-week statuses when Shifts needs sealed drafts too.
   */
  async listHistoryForPr(
    prId: string,
    opts?: { statuses?: PaymentVoucherStatus[]; excludeWeekStart?: string },
  ): Promise<PaymentVoucherWithLines[]> {
    try {
      const statuses = opts?.statuses ?? (['signed', 'paid'] as PaymentVoucherStatus[]);
      const conditions = [
        eq(PaymentVoucherTable.prId, prId),
        inArray(PaymentVoucherTable.status, statuses),
      ];
      if (opts?.excludeWeekStart) {
        conditions.push(ne(PaymentVoucherTable.weekStart, opts.excludeWeekStart));
      }
      const vouchers = await db
        .select()
        .from(PaymentVoucherTable)
        .where(and(...conditions))
        .orderBy(desc(PaymentVoucherTable.weekStart), desc(PaymentVoucherTable.createdAt));

      const withLines: PaymentVoucherWithLines[] = [];
      for (const voucher of vouchers) {
        const lines = await this.getLines(voucher.id);
        withLines.push({ ...voucher, lines });
      }
      return withLines;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listHistoryForPr] Error:', error);
      throw error;
    }
  }

  /**
   * Every voucher for one payroll week at the given statuses, lines included.
   * The weekly issue pass uses this to promote a closed week's drafts to 'sent'
   * — including drafts the PR accumulated live, which the generator's
   * already-exists skip would otherwise leave unissued forever.
   */
  async listForWeek(
    weekStart: string,
    statuses: PaymentVoucherStatus[],
  ): Promise<PaymentVoucherWithLines[]> {
    try {
      const vouchers = await db
        .select()
        .from(PaymentVoucherTable)
        .where(
          and(
            eq(PaymentVoucherTable.weekStart, weekStart),
            inArray(PaymentVoucherTable.status, statuses),
          ),
        )
        .orderBy(desc(PaymentVoucherTable.createdAt));
      const withLines: PaymentVoucherWithLines[] = [];
      for (const voucher of vouchers) {
        const lines = await this.getLines(voucher.id);
        withLines.push({ ...voucher, lines });
      }
      return withLines;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listForWeek] Error:', error);
      throw error;
    }
  }

  /**
   * One voucher with everything the printed/exported PV document shows: lines
   * plus the issuing agency and payee PR read via their FKs — the voucher row
   * itself never duplicates those facts.
   */
  async getExportBundle(voucherId: string): Promise<{
    voucher: PaymentVoucherWithLines;
    agency: {
      name: string;
      ssmNo: string;
      contactPhone: string | null;
      contactEmail: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
    } | null;
    pr: {
      name: string;
      nickname: string | null;
      icNo: string | null;
      phone: string | null;
      bankName: string | null;
      bankAccountNo: string | null;
    } | null;
  } | null> {
    try {
      const [row] = await db
        .select({
          voucher: PaymentVoucherTable,
          agencyName: AgencyTable.name,
          agencySsmNo: AgencyTable.ssmNo,
          agencyPhone: AgencyTable.contactPhone,
          agencyEmail: AgencyTable.contactEmail,
          agencyAddress1: AgencyTable.addressLine1,
          agencyAddress2: AgencyTable.addressLine2,
          prName: PrTable.name,
          prNickname: PrTable.nickname,
          prIcNo: PrTable.icNo,
          prPhone: PrTable.phone,
          // The account's number wins over the roster's — same rule as
          // PrRepository.withAccountPhone. A printed voucher is the document a
          // PR is paid against, so the phone on it must be the one the person
          // actually uses, not a copy that drifted.
          prAccountPhone: UserTable.phoneNum,
          // Where this person is actually paid. Reached by FK through the
          // ACCOUNT (pr.user_id -> user_profile), never copied onto `pr`: a bank
          // account is a fact about the person, and the same hop is what keeps it
          // blanked for outlet callers. A PR with no account has no bank details,
          // which is correct — you cannot pay someone who has not said where.
          prBankName: UserProfileTable.bankName,
          prBankAccountNo: UserProfileTable.bankAccountNo,
        })
        .from(PaymentVoucherTable)
        .leftJoin(AgencyTable, eq(PaymentVoucherTable.agencyId, AgencyTable.id))
        .leftJoin(PrTable, eq(PaymentVoucherTable.prId, PrTable.id))
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, PrTable.userId))
        .where(eq(PaymentVoucherTable.id, voucherId))
        .limit(1);
      if (!row) return null;
      const lines = await this.getLines(row.voucher.id);
      return {
        voucher: { ...row.voucher, lines },
        agency: row.agencyName
          ? {
              name: row.agencyName,
              ssmNo: row.agencySsmNo ?? '',
              contactPhone: row.agencyPhone,
              contactEmail: row.agencyEmail,
              addressLine1: row.agencyAddress1,
              addressLine2: row.agencyAddress2,
            }
          : null,
        pr: row.prName
          ? {
              name: row.prName,
              nickname: row.prNickname,
              icNo: row.prIcNo,
              phone: row.prAccountPhone ?? row.prPhone,
              bankName: row.prBankName,
              bankAccountNo: row.prBankAccountNo,
            }
          : null,
      };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getExportBundle] Error:', error);
      throw error;
    }
  }

  /**
   * Finds the PR's current-week draft voucher, creating an empty one if absent.
   *
   * ⚠️ THIS IS WHERE THE DOUBLE VOUCHER CAME FROM. `getCurrentWeekDraft` filters
   * `status = 'pending_review'`, so once a week's voucher had been SENT, the next
   * self-log found nothing and cheerfully created a SECOND voucher for the very
   * same PR and week. That is exactly how Victoria ended up with `PV-000002`
   * (sent, RM1,581.48) and `PV-000004` (pending_review, RM703.60) — the same
   * seven days billed twice, the wrong one already in the PR's hands.
   *
   * So the existence check is now made across EVERY status, and a week that has
   * already left draft is REFUSED rather than restarted. Appending to the sent
   * voucher instead would be worse: it would silently change a document the PR
   * has already been given, and the agency has already signed off.
   *
   * Returns a discriminated result rather than throwing, so the caller has to
   * decide what to tell the PR — a self-log lost to a swallowed exception is the
   * failure mode this whole area is being repaired for.
   */
  async getOrCreateCurrentWeekDraft(data: {
    prId: string;
    agencyId: string;
    prName: string;
    prIc?: string | null;
    outlet?: string | null;
    weekStart: string;
    weekEnd: string;
    actor: string;
  }): Promise<
    | { ok: true; voucher: PaymentVoucherType }
    | { ok: false; reason: string; existing: PaymentVoucherType }
  > {
    try {
      const existing = await this.getCurrentWeekDraft(data.prId, data.weekStart);
      if (existing) return { ok: true, voucher: existing };

      // No DRAFT — but is there a voucher for this week at all? Checked across
      // every status precisely because the draft lookup cannot see one.
      const closed = await this.getWeekVoucher(data.prId, data.weekStart);
      if (closed) {
        return {
          ok: false,
          existing: closed,
          reason:
            `This week's payment voucher (${closed.voucherNo ?? closed.id}) has already been ` +
            `${closed.status === 'sent' ? 'sent to you' : closed.status} and can no longer be ` +
            'added to. Ask your agency to reopen it or record this on next week\'s voucher.',
        };
      }

      const values = {
        agencyId: data.agencyId,
        prId: data.prId,
        prName: data.prName,
        prIc: data.prIc ?? undefined,
        outlet: data.outlet ?? undefined,
        cycle: 'Weekly',
        weekStart: data.weekStart,
        weekEnd: data.weekEnd,
        subtotal: '0.00',
        deduction: '0.00',
        net: '0.00',
        status: 'pending_review' as const,
        createdBy: data.actor,
        updatedBy: data.actor,
      };
      // Numbered here too. A PR's very first self-log creates this draft, and it
      // becomes the voucher they are eventually paid against — a voucher that
      // acquired its number later would have gone unnumbered for a whole week.
      const created = await db.transaction(async (tx) => {
        for (let bump = 1; bump <= VOUCHER_NO_ATTEMPTS; bump++) {
          const voucherNo = await this.nextVoucherNo(tx, bump);
          try {
            // SAVEPOINT per attempt — see the identical note in create(). Without
            // it the first number clash aborts the whole transaction and attempt 2
            // dies on its own SELECT with 25P02, so the retry never happens. This
            // is the PR self-log path, so the failure would surface as a PR unable
            // to log a drink rather than as anything mentioning voucher numbers.
            const voucher = await tx.transaction(async (sp) => {
              const [row] = await sp
                .insert(PaymentVoucherTable)
                .values({ ...values, voucherNo })
                .returning();
              return row;
            });
            if (voucher) return voucher;
          } catch (conflict) {
            if (!isVoucherNoConflict(conflict)) throw conflict;
          }
        }
        logger.warn(
          '[PaymentVoucherRepository.getOrCreateCurrentWeekDraft] Could not allocate a voucher number; creating unnumbered',
        );
        const [voucher] = await tx.insert(PaymentVoucherTable).values(values).returning();
        return voucher;
      });
      return { ok: true, voucher: created };
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getOrCreateCurrentWeekDraft] Error:', error);
      throw error;
    }
  }

  /** One line joined to its voucher — used to authorize a PR line op by owner. */
  async getLineWithVoucher(
    lineId: string,
  ): Promise<{ line: PaymentVoucherLineType; voucher: PaymentVoucherType } | null> {
    try {
      const [row] = await db
        .select({ line: PaymentVoucherLineTable, voucher: PaymentVoucherTable })
        .from(PaymentVoucherLineTable)
        .innerJoin(PaymentVoucherTable, eq(PaymentVoucherLineTable.voucherId, PaymentVoucherTable.id))
        .where(eq(PaymentVoucherLineTable.id, lineId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getLineWithVoucher] Error:', error);
      throw error;
    }
  }

  /**
   * Every scanned/self-logged receipt belonging to ONE agency's PRs, with the
   * full OCR evidence the agency reviews: order number, printed date/time,
   * photos, PR note, and each FK-linked line (item, quantity, amount). PR
   * identity resolves through voucher.pr_id → pr — never copied. Newest first.
   */
  async listReceiptsForAgency(
    agencyId: string,
    opts: { fromDate?: string; toDate?: string; limit?: number } = {},
  ) {
    try {
      const conditions = [eq(PaymentVoucherTable.agencyId, agencyId)];
      if (opts.fromDate) {
        conditions.push(
          sql`(${PaymentVoucherReceiptTable.createdAt} at time zone 'Asia/Kuala_Lumpur')::date >= ${opts.fromDate}::date`,
        );
      }
      if (opts.toDate) {
        conditions.push(
          sql`(${PaymentVoucherReceiptTable.createdAt} at time zone 'Asia/Kuala_Lumpur')::date <= ${opts.toDate}::date`,
        );
      }
      const receipts = await db
        .select({
          receipt: PaymentVoucherReceiptTable,
          voucherId: PaymentVoucherTable.id,
          voucherStatus: PaymentVoucherTable.status,
          weekStart: PaymentVoucherTable.weekStart,
          weekEnd: PaymentVoucherTable.weekEnd,
          prId: PaymentVoucherTable.prId,
          prName: PrTable.name,
          prNickname: PrTable.nickname,
        })
        .from(PaymentVoucherReceiptTable)
        .innerJoin(
          PaymentVoucherTable,
          eq(PaymentVoucherTable.id, PaymentVoucherReceiptTable.voucherId),
        )
        .leftJoin(PrTable, eq(PrTable.id, PaymentVoucherTable.prId))
        .where(and(...conditions))
        .orderBy(desc(PaymentVoucherReceiptTable.createdAt))
        .limit(Math.min(opts.limit ?? 200, 500));

      const receiptIds = receipts.map((r) => r.receipt.id);
      const lines = receiptIds.length
        ? await db
            .select()
            .from(PaymentVoucherLineTable)
            .where(inArray(PaymentVoucherLineTable.receiptId, receiptIds))
        : [];
      const linesByReceipt = new Map<string, typeof lines>();
      for (const line of lines) {
        if (!line.receiptId) continue;
        const list = linesByReceipt.get(line.receiptId) ?? [];
        list.push(line);
        linesByReceipt.set(line.receiptId, list);
      }
      return receipts.map((r) => ({
        ...r,
        lines: linesByReceipt.get(r.receipt.id) ?? [],
      }));
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listReceiptsForAgency] Error:', error);
      throw error;
    }
  }

  /** Lines still pointing at this receipt (checked after deleting one). */
  async countLinesForReceipt(receiptId: string): Promise<number> {
    try {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(PaymentVoucherLineTable)
        .where(eq(PaymentVoucherLineTable.receiptId, receiptId));
      return row?.n ?? 0;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.countLinesForReceipt] Error:', error);
      throw error;
    }
  }

  /** Removes a receipt row outright — its snap goes with it. */
  async deleteReceipt(receiptId: string): Promise<void> {
    try {
      await db
        .delete(PaymentVoucherReceiptTable)
        .where(eq(PaymentVoucherReceiptTable.id, receiptId));
    } catch (error) {
      logger.error('[PaymentVoucherRepository.deleteReceipt] Error:', error);
      throw error;
    }
  }

  /** Keeps the parent receipt's picture in step with a re-snapped line. */
  async updateReceiptPhotos(
    receiptId: string,
    proofPhotos: string[] | null,
    actor: string,
  ): Promise<void> {
    try {
      await db
        .update(PaymentVoucherReceiptTable)
        .set({ proofPhotos, updatedAt: new Date(), updatedBy: actor })
        .where(eq(PaymentVoucherReceiptTable.id, receiptId));
    } catch (error) {
      logger.error('[PaymentVoucherRepository.updateReceiptPhotos] Error:', error);
      throw error;
    }
  }

  /**
   * One receipt joined to its voucher — how a review or a line edit is
   * authorized, since a receipt carries no agency of its own (it reaches one
   * only through voucher.agency_id).
   */
  async getReceiptWithVoucher(
    receiptId: string,
  ): Promise<{ receipt: PaymentVoucherReceiptType; voucher: PaymentVoucherType } | null> {
    try {
      const [row] = await db
        .select({ receipt: PaymentVoucherReceiptTable, voucher: PaymentVoucherTable })
        .from(PaymentVoucherReceiptTable)
        .innerJoin(
          PaymentVoucherTable,
          eq(PaymentVoucherReceiptTable.voucherId, PaymentVoucherTable.id),
        )
        .where(eq(PaymentVoucherReceiptTable.id, receiptId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.getReceiptWithVoucher] Error:', error);
      throw error;
    }
  }

  /**
   * Move one receipt through the review lifecycle.
   *
   * `reviewedAt`/`reviewedBy` are stamped on every transition a PERSON makes, so
   * an approval always says who and when. The automatic APPROVED->VERIFIED
   * rollover below deliberately leaves them alone: verification there is the
   * approval closing, not a second decision, and overwriting them would lose the
   * name of the only human who actually looked.
   */
  async setReceiptStatus(
    receiptId: string,
    status: PaymentVoucherReceiptStatus,
    actor: string,
  ): Promise<PaymentVoucherReceiptType | null> {
    try {
      const [row] = await db
        .update(PaymentVoucherReceiptTable)
        .set({
          status,
          // Un-approving is a correction, not a review — clear the stamp so the
          // row never claims a decision that has been taken back.
          reviewedAt: status === 'pending' ? null : new Date(),
          reviewedBy: status === 'pending' ? null : actor,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(eq(PaymentVoucherReceiptTable.id, receiptId))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.setReceiptStatus] Error:', error);
      throw error;
    }
  }

  /**
   * APPROVED -> VERIFIED, the automatic arm of the lifecycle.
   *
   * Two modes, one implementation so they cannot drift: `voucherId` closes the
   * receipts on a single voucher (a dispute has just been resolved), and
   * `throughWeekStart` closes every approved receipt on a week that has ended (the
   * Monday rollover). The week form uses `<=`, not `=`: a voucher held back for a
   * fortnight must still roll over when it finally clears, and an `=` would skip
   * it forever.
   *
   * Vouchers carrying an OPEN dispute are excluded. Verified means closed, and
   * closing the evidence while somebody is still contesting the money would
   * settle the record out from under a live claim. Those roll over on the next
   * pass, once the dispute is resolved.
   *
   * Returns the receipt numbers actually moved, so a caller can log a fact
   * rather than an intention.
   */
  async verifyApprovedReceipts(opts: {
    voucherId?: string;
    throughWeekStart?: string;
    actor: string;
  }): Promise<string[]> {
    if (!opts.voucherId && !opts.throughWeekStart) return [];
    try {
      const voucherFilter = opts.voucherId
        ? eq(PaymentVoucherTable.id, opts.voucherId)
        : lte(PaymentVoucherTable.weekStart, opts.throughWeekStart!);

      const rows = await db
        .update(PaymentVoucherReceiptTable)
        .set({ status: 'verified', updatedAt: new Date(), updatedBy: opts.actor })
        .where(
          and(
            eq(PaymentVoucherReceiptTable.status, 'approved'),
            inArray(
              PaymentVoucherReceiptTable.voucherId,
              db.select({ id: PaymentVoucherTable.id }).from(PaymentVoucherTable).where(voucherFilter),
            ),
            notExists(
              db
                .select({ one: sql`1` })
                .from(PaymentVoucherDisputeTable)
                .where(
                  and(
                    eq(PaymentVoucherDisputeTable.voucherId, PaymentVoucherReceiptTable.voucherId),
                    isNull(PaymentVoucherDisputeTable.outcome),
                  ),
                ),
            ),
          ),
        )
        .returning({ receiptNo: PaymentVoucherReceiptTable.receiptNo });
      return rows.map((r) => r.receiptNo);
    } catch (error) {
      logger.error('[PaymentVoucherRepository.verifyApprovedReceipts] Error:', error);
      // Fails soft: an unrolled receipt stays approved and rolls next pass. It
      // must not cost the caller (the Monday job) the work it does afterwards.
      return [];
    }
  }

  /**
   * A receipt already logged with the same order number — scoped to ONE shift.
   * Outlets reuse order numbers across nights, so the same ORD number on a NEW
   * shift is a new paper receipt (it still gets its own unique RCP number);
   * only a re-scan within the same shift is a duplicate. Callers without a
   * shift stamp keep the older voucher-wide check, which can only
   * over-refuse — never double-log.
   *
   * ⚠️ The match is made in JS on the OCR-folded key, NOT with `eq()` in SQL.
   * An exact comparison is how one live voucher paid the same Lemon Drop twice:
   * OCR read one paper as `ORD0389` and the other as `ORDO389` — letter O
   * against digit zero — so the DB saw two different strings and logged both.
   * `normaliseOrderNo` folds exactly the characters OCR confuses. The candidate
   * set is one voucher (usually one shift) of receipts, so comparing in memory
   * is cheap; expressing the fold in SQL would also make it unindexable without
   * buying anything.
   */
  async findReceiptByOrderNo(
    voucherId: string,
    orderNo: string,
    shiftAssignmentId?: string | null,
  ): Promise<PaymentVoucherReceiptType | null> {
    try {
      const candidates = await db
        .select()
        .from(PaymentVoucherReceiptTable)
        .where(
          and(
            eq(PaymentVoucherReceiptTable.voucherId, voucherId),
            ...(shiftAssignmentId
              ? [eq(PaymentVoucherReceiptTable.shiftAssignmentId, shiftAssignmentId)]
              : []),
          ),
        );
      return candidates.find((row) => isSameOrderNo(row.orderNo, orderNo)) ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.findReceiptByOrderNo] Error:', error);
      throw error;
    }
  }

  /**
   * The next receipt number: MAX of the numeric suffix, never count(*).
   *
   * Identical reasoning to `nextVoucherNo`, and identically wrong here until
   * 2 Aug 2026. A count RECYCLES numbers after any delete, and receipts ARE
   * deletable — `removeMyReceipt` exists precisely so a PR can drop a bad
   * self-log — so deleting two receipts made the next scan reissue a number an
   * earlier receipt already held. That matters more for receipts than for
   * vouchers: `RCP-…` is what the refusal messages quote back at the PR
   * ("RCP-000007 has already been reviewed by the agency"), so two rows
   * answering to one name make those messages point at the wrong receipt.
   *
   * Non-conforming values (NULL, or anything with no digits) become NULL and
   * are ignored by max(), so one malformed row cannot stall numbering forever.
   */
  private async nextReceiptNo(tx: DbTransaction, bump: number): Promise<string> {
    const [row] = await tx
      .select({
        highest: sql<number>`coalesce(max(nullif(regexp_replace(${PaymentVoucherReceiptTable.receiptNo}, '\\D', '', 'g'), '')::int), 0)`,
      })
      .from(PaymentVoucherReceiptTable);
    return `RCP-${String(Number(row?.highest ?? 0) + bump).padStart(6, '0')}`;
  }

  /**
   * Persists ONE whole receipt: the payment_voucher_receipt row (with its
   * DATABASE-GENERATED unique running number RCP-000001, RCP-000002, … taken
   * from the HIGHEST number issued so far) plus one payment_voucher_line per
   * item, FK-linked via receipt_id — all in a single transaction, then the
   * voucher totals recompute. Retries the running number on a rare unique
   * collision.
   */
  async createReceiptWithLines(
    receipt: ReceiptInput,
    lines: LineInput[],
  ): Promise<{ receipt: PaymentVoucherReceiptType; lines: PaymentVoucherLineType[] }> {
    try {
      return await db.transaction(async (tx) => {
        let inserted: PaymentVoucherReceiptType | null = null;
        for (let bump = 1; bump <= 5 && !inserted; bump++) {
          // Re-read inside the loop, not once above it: on a genuine collision
          // the highest number may have moved, and a value read before the
          // first attempt would simply collide again at every bump.
          const receiptNo = await this.nextReceiptNo(tx, bump);
          try {
            // SAVEPOINT per attempt (drizzle's nested transaction), and it is
            // load-bearing rather than tidiness — the same defect that was fixed
            // on the voucher allocator on 31 Jul and left standing here. In
            // PostgreSQL a failed statement aborts the WHOLE transaction, so
            // without this the first clash poisons `tx`, the next iteration's
            // own SELECT comes back 25P02 "current transaction is aborted", and
            // because 25P02 is not a unique violation it is rethrown — the loop
            // could never reach attempt 2, and the caller saw an error about a
            // SELECT rather than about a number clash.
            inserted = await tx.transaction(async (sp) => {
              const [row] = await sp
                .insert(PaymentVoucherReceiptTable)
                .values({ ...receipt, receiptNo })
                .returning();
              return row;
            });
          } catch (e) {
            const pgCode = (e as { code?: string }).code;
            if (pgCode !== '23505' || bump === 5) throw e; // not a dupe, or out of retries
          }
        }
        if (!inserted) throw new Error('Could not allocate a receipt number');
        await this.assertLinesAgreeWithShifts(tx, lines);
        const existing = await this.getLines(receipt.voucherId, tx);
        const insertedLines = await tx
          .insert(PaymentVoucherLineTable)
          .values(
            lines.map((line, i) =>
              prepareLine({
                ...line,
                voucherId: receipt.voucherId,
                receiptId: inserted!.id,
                sortOrder: existing.length + i,
              }),
            ),
          )
          .returning();
        await this.recomputeTotals(receipt.voucherId, tx);
        return { receipt: inserted, lines: insertedLines };
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.createReceiptWithLines] Error:', error);
      throw error;
    }
  }

  /** Appends one line to a voucher and recomputes its totals. */
  async addLine(voucherId: string, line: LineInput): Promise<PaymentVoucherLineType> {
    try {
      return await db.transaction(async (tx) => {
        await this.assertLinesAgreeWithShifts(tx, [line]);
        const existing = await this.getLines(voucherId, tx);
        const [inserted] = await tx
          .insert(PaymentVoucherLineTable)
          .values(prepareLine({ ...line, voucherId, sortOrder: existing.length }))
          .returning();
        await this.recomputeTotals(voucherId, tx);
        return inserted;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.addLine] Error:', error);
      throw error;
    }
  }

  /** Patches one line in place and recomputes its voucher totals. */
  async updateLine(
    lineId: string,
    patch: Partial<LineInput>,
  ): Promise<PaymentVoucherLineType | null> {
    try {
      return await db.transaction(async (tx) => {
        const [line] = await tx
          .update(PaymentVoucherLineTable)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(PaymentVoucherLineTable.id, lineId))
          .returning();
        if (!line) return null;
        await this.recomputeTotals(line.voucherId, tx);
        return line;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.updateLine] Error:', error);
      throw error;
    }
  }

  /** Removes one line and recomputes its voucher totals. */
  async deleteLine(lineId: string): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        const [line] = await tx
          .delete(PaymentVoucherLineTable)
          .where(eq(PaymentVoucherLineTable.id, lineId))
          .returning({ voucherId: PaymentVoucherLineTable.voucherId });
        if (!line) return false;
        await this.recomputeTotals(line.voucherId, tx);
        return true;
      });
    } catch (error) {
      logger.error('[PaymentVoucherRepository.deleteLine] Error:', error);
      throw error;
    }
  }

  /** subtotal = Σ line amounts; net = subtotal − deduction. */
  private async recomputeTotals(voucherId: string, tx: DbTransaction): Promise<void> {
    const [row] = await tx
      .select({ subtotal: sql<string>`coalesce(sum(${PaymentVoucherLineTable.amount}), 0)::numeric(12,2)` })
      .from(PaymentVoucherLineTable)
      .where(eq(PaymentVoucherLineTable.voucherId, voucherId));
    const subtotal = Number(row?.subtotal ?? 0);
    const [voucher] = await tx
      .select({ deduction: PaymentVoucherTable.deduction })
      .from(PaymentVoucherTable)
      .where(eq(PaymentVoucherTable.id, voucherId));
    const deduction = Number(voucher?.deduction ?? 0);
    await tx
      .update(PaymentVoucherTable)
      .set({
        subtotal: subtotal.toFixed(2),
        net: (subtotal - deduction).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(PaymentVoucherTable.id, voucherId));
  }

  /** Every day the agency has acted on for this voucher. Absence = unreviewed. */
  async listDayReviews(voucherId: string): Promise<PaymentVoucherDayReviewType[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherDayReviewTable)
        .where(eq(PaymentVoucherDayReviewTable.voucherId, voucherId))
        .orderBy(PaymentVoucherDayReviewTable.reviewDate);
    } catch (error) {
      logger.error('[PaymentVoucherRepository.listDayReviews] Error:', error);
      return [];
    }
  }

  /**
   * Record (or change) the agency's decision on one day.
   *
   * Upserts on the unique `(voucher_id, review_date)` so re-approving a day
   * moves it rather than stacking a second row — the DB enforces one decision
   * per day rather than the controller hoping for it.
   *
   * `approvedTotalCents` is the day's total AT THIS MOMENT and must be computed
   * server-side from the lines; never take it from the client. It is what makes
   * a later regeneration detectable as stale.
   */
  async upsertDayReview(input: {
    voucherId: string;
    reviewDate: string;
    status: PaymentVoucherDayReviewStatus;
    approvedTotalCents: number | null;
    note?: string | null;
    bulk?: boolean;
    actor: string;
  }): Promise<PaymentVoucherDayReviewType | null> {
    try {
      const rows = await db
        .insert(PaymentVoucherDayReviewTable)
        .values({
          voucherId: input.voucherId,
          reviewDate: input.reviewDate,
          status: input.status,
          approvedTotalCents: input.approvedTotalCents,
          note: input.note ?? null,
          bulk: input.bulk ?? false,
          reviewedAt: new Date(),
          reviewedBy: input.actor,
          createdBy: input.actor,
          updatedBy: input.actor,
        })
        .onConflictDoUpdate({
          target: [
            PaymentVoucherDayReviewTable.voucherId,
            PaymentVoucherDayReviewTable.reviewDate,
          ],
          set: {
            status: input.status,
            approvedTotalCents: input.approvedTotalCents,
            note: input.note ?? null,
            bulk: input.bulk ?? false,
            reviewedAt: new Date(),
            reviewedBy: input.actor,
            updatedAt: new Date(),
            updatedBy: input.actor,
          },
        })
        .returning();
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.upsertDayReview] Error:', error);
      return null;
    }
  }

  /** Un-review a day: the row goes, and the day reads as never looked at. */
  async deleteDayReview(voucherId: string, reviewDate: string): Promise<boolean> {
    try {
      const rows = await db
        .delete(PaymentVoucherDayReviewTable)
        .where(
          and(
            eq(PaymentVoucherDayReviewTable.voucherId, voucherId),
            eq(PaymentVoucherDayReviewTable.reviewDate, reviewDate),
          ),
        )
        .returning();
      return rows.length > 0;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.deleteDayReview] Error:', error);
      return false;
    }
  }

  /**
   * Is any day explicitly held? Fails CLOSED — an error reports "held", because
   * the caller uses this to decide whether a voucher may be sent, and letting a
   * database blip open that gate is the wrong direction to fail in.
   */
  async hasHeldDay(voucherId: string): Promise<boolean> {
    try {
      const rows = await db
        .select({ id: PaymentVoucherDayReviewTable.id })
        .from(PaymentVoucherDayReviewTable)
        .where(
          and(
            eq(PaymentVoucherDayReviewTable.voucherId, voucherId),
            eq(PaymentVoucherDayReviewTable.status, 'held'),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      logger.error('[PaymentVoucherRepository.hasHeldDay] Error:', error);
      return true;
    }
  }
}
