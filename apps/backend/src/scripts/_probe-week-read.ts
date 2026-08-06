import './_probe-env';
import { klToday, weekOfDate } from '../features/payment-voucher/payment-voucher-week';
import { PaymentVoucherRepositoryClass } from '../features/payment-voucher/payment-voucher.repository';

async function main() {
  const repo = new PaymentVoucherRepositoryClass();
  const weekStart = weekOfDate(klToday())!.weekStart;
  const prId = process.argv[2];
  const read = await repo.getWeekVoucher(prId, weekStart);
  const open = await repo.getCurrentWeekDraft(prId, weekStart);
  console.log('today =', klToday(), '| weekStart =', weekStart);
  console.log('getWeekVoucher      =', read ? `${read.voucherNo} ${read.status} net=${read.net} lines=${read.lines.length}` : 'null');
  console.log('getCurrentWeekDraft =', open ? `${open.voucherNo} ${open.status}` : 'null   <-- what This-week read before');
  process.exit(0);
}
main();
