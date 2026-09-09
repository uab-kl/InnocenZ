import { makeSplicer } from './tmp-eol.mjs';
const T = String.fromCharCode(9);
const I = (n) => T.repeat(n);
const f = makeSplicer('apps/web/src/agency-portal/components/iz/SubscriptionRecordList.tsx');

// ---- imports --------------------------------------------------------------
f.block(
['import { periodLabel } from "@agency-portal/lib/subscription-record";'],
[
'import { periodLabel } from "@agency-portal/lib/subscription-record";',
'import {',
I(1) + 'dueStatusFor,',
I(1) + 'formatDueDate,',
I(1) + 'overdueSummary,',
'} from "@agency-portal/lib/subscription-due";',
]);

// ---- the warning, above the payable list ----------------------------------
f.block(
[
I(4) + '<div className="space-y-2">',
I(5) + '<p className="iz-tiny iz-muted2">{t.subscription.selectToPay}</p>',
],
[
I(4) + '<div className="space-y-2">',
I(5) + '<OverduePaymentWarning invoices={unpaid} />',
I(5) + '<p className="iz-tiny iz-muted2">{t.subscription.selectToPay}</p>',
]);
f.save();
