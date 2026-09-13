/**
 * READ-ONLY. Does the COMMISSION a phone posted fit the rate card the SERVER holds?
 *
 * `payment_voucher_line.amount` for a drinks/tips line is whatever the PR's phone
 * sent; the rate card lives in `shift_pay_tier` (per-shift override) falling back
 * to `outlet_tier_rate` (the venue default). The ref is
 * `kind|source|sales|dedupe|category`, and the assignment id in `dedupe` reaches
 * the shift, the outlet and the PR's tier.
 *
 * The ceiling is deliberately GENEROUS: the greater of the normal and happy-hour
 * drink %, because the server cannot know from a stored row whether the sale fell
 * inside the window. Anything over that ceiling could not have come from the rate
 * card under ANY reading of it.
 *
 * Run BEFORE adding a server-side ceiling: if honest rows already exceed it, the
 * ceiling is wrong, not the data.
 *
 * Writes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  with line as (
    select
      l.id,
      split_part(l.ref, '|', 1)                     as kind,
      split_part(l.ref, '|', 2)                     as source,
      nullif(split_part(l.ref, '|', 3), '')::numeric as sales,
      -- A RECEIPT line carries orderNo:index in the dedupe slot, not an
      -- assignment id, so the assignment is reached through the receipt's own
      -- FK. Only a bare addMyLine puts a uuid there.
      coalesce(
        r.shift_assignment_id,
        case when split_part(l.ref, '|', 4) ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then split_part(l.ref, '|', 4)::uuid end
      )                                             as assignment_id,
      l.amount::numeric                             as amount
    from main.payment_voucher_line l
    left join main.payment_voucher_receipt r on r.id = l.receipt_id
    where split_part(l.ref, '|', 1) in ('drinks', 'tips')
  ),
  ctx as (
    select
      line.*,
      s.id            as shift_id,
      s.outlet_id,
      ap.tier         as pr_tier,
      case ap.tier
        when 'tier_1' then 'Tier I'   when 'tier_2' then 'Tier II'
        when 'tier_3' then 'Tier III' when 'tier_4' then 'Tier IV'
        when 'tier_5' then 'Tier V'   when 'servant' then 'Servant'
        else null end as tier_label
    from line
    join main.shift_assignment sa on sa.id = line.assignment_id
    join main.shift s             on s.id  = sa.shift_id
    left join main.agency_pr ap   on ap.user_id = sa.user_id and ap.agency_id = sa.agency_id
  ),
  priced as (
    select
      ctx.*,
      coalesce(spt.drink_pct,  otr.drink_pct,  0)::numeric             as drink_pct,
      coalesce(spt.happy_hour_drink_pct, otr.happy_hour_drink_pct)::numeric as hh_pct,
      coalesce(spt.tip_pct,    otr.tip_pct,    0)::numeric             as tip_pct
    from ctx
    left join main.shift_pay_tier spt
      on spt.shift_id = ctx.shift_id and spt.tier = ctx.tier_label
    left join main.outlet_tier_rate otr
      on otr.outlet_id = ctx.outlet_id and otr.tier = ctx.tier_label
  )
  select
    kind,
    count(*)                                                       as lines,
    count(*) filter (where ceiling_rm is null)                     as no_rate_card,
    count(*) filter (where ceiling_rm is not null
                       and amount > ceiling_rm + 0.01)             as over_ceiling,
    coalesce(max(amount - ceiling_rm) filter
             (where ceiling_rm is not null), 0)                    as worst_excess_rm
  from (
    select
      kind, amount,
      case when kind = 'drinks'
             then sales * greatest(drink_pct, coalesce(hh_pct, drink_pct)) / 100
           else sales * tip_pct / 100 end as ceiling_rm
    from priced
  ) z
  group by kind
  order by kind
`);
console.log('drinks/tips commission vs the rate-card ceiling:');
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
