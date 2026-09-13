/** READ-ONLY. The individual lines that exceed the rate-card ceiling, with why. */
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
      split_part(l.ref, '|', 1)                      as kind,
      split_part(l.ref, '|', 2)                      as source,
      nullif(split_part(l.ref, '|', 3), '')::numeric as sales,
      coalesce(
        r.shift_assignment_id,
        case when split_part(l.ref, '|', 4) ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then split_part(l.ref, '|', 4)::uuid end
      )                                              as assignment_id,
      l.quantity,
      l.description,
      l.amount::numeric                              as amount
    from main.payment_voucher_line l
    left join main.payment_voucher_receipt r on r.id = l.receipt_id
    where split_part(l.ref, '|', 1) in ('drinks', 'tips')
  ),
  priced as (
    select
      line.*, ap.tier as pr_tier,
      coalesce(spt.drink_pct, otr.drink_pct, 0)::numeric                    as drink_pct,
      coalesce(spt.happy_hour_drink_pct, otr.happy_hour_drink_pct)::numeric as hh_pct,
      coalesce(spt.tip_pct, otr.tip_pct, 0)::numeric                        as tip_pct
    from line
    join main.shift_assignment sa on sa.id = line.assignment_id
    join main.shift s             on s.id  = sa.shift_id
    left join main.agency_pr ap   on ap.user_id = sa.user_id and ap.agency_id = sa.agency_id
    left join main.shift_pay_tier spt on spt.shift_id = s.id
      and spt.tier = case ap.tier when 'tier_1' then 'Tier I' when 'tier_2' then 'Tier II'
                                  when 'tier_3' then 'Tier III' when 'tier_4' then 'Tier IV'
                                  when 'tier_5' then 'Tier V' when 'servant' then 'Servant' end
    left join main.outlet_tier_rate otr on otr.outlet_id = s.outlet_id
      and otr.tier = case ap.tier when 'tier_1' then 'Tier I' when 'tier_2' then 'Tier II'
                                  when 'tier_3' then 'Tier III' when 'tier_4' then 'Tier IV'
                                  when 'tier_5' then 'Tier V' when 'servant' then 'Servant' end
  )
  select kind, source, description, quantity, sales, amount, pr_tier,
         drink_pct, hh_pct, tip_pct,
         round(case when kind = 'drinks'
                 then sales * greatest(drink_pct, coalesce(hh_pct, drink_pct)) / 100
                 else sales * tip_pct / 100 end, 2) as ceiling_rm
  from priced
  where amount > (case when kind = 'drinks'
                    then sales * greatest(drink_pct, coalesce(hh_pct, drink_pct)) / 100
                    else sales * tip_pct / 100 end) + 0.01
  order by amount - (case when kind = 'drinks'
                    then sales * greatest(drink_pct, coalesce(hh_pct, drink_pct)) / 100
                    else sales * tip_pct / 100 end) desc
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
