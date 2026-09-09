import { makeSplicer } from './tmp-eol.mjs';
const T = String.fromCharCode(9);
const f = makeSplicer('apps/web/src/lib/portal-i18n/translations.ts');

f.after(T + T + 'billingDueCta: "Open Subscription",', [
	T + T + '/**',
	T + T + ' * THE SERIOUS VARIANT. Shown only once something is genuinely past its due',
	T + T + ' * date \u2014 the ordinary `billingDue*` wording covers money merely unpaid.',
	T + T + ' *',
	T + T + ' * States facts and stops. It does NOT threaten suspension or interruption:',
	T + T + ' * nothing in this platform suspends an organisation for an unpaid',
	T + T + ' * subscription, and a warning that implies a consequence the code will not',
	T + T + ' * deliver is a lie that gets found out the first time someone ignores it.',
	T + T + ' */',
	T + T + 'billingOverdueTitle: "Subscription payment overdue",',
	T + T + '/** {late} is the already-localized "N days overdue" fragment. */',
	T + T + 'billingOverdueOne: "{amount} is overdue \u2014 it was due {date}, {late}.",',
	T + T + 'billingOverdueMany:',
	T + T + T + '"{amount} is overdue across {n} billing periods. The oldest was due {date}, {late}.",',
]);

f.after(T + T + 'billingDueCta: "\u6253\u5f00\u8ba2\u9605",', [
	T + T + 'billingOverdueTitle: "\u8ba2\u9605\u4ed8\u6b3e\u5df2\u903e\u671f",',
	T + T + 'billingOverdueOne: "{amount} \u5df2\u903e\u671f \u2014 \u5230\u671f\u65e5 {date}\uff0c{late}\u3002",',
	T + T + 'billingOverdueMany:',
	T + T + T + '"{n} \u4e2a\u8ba1\u8d39\u5468\u671f\u5171 {amount} \u5df2\u903e\u671f\u3002\u6700\u65e9\u4e00\u7b14\u5230\u671f\u65e5 {date}\uff0c{late}\u3002",',
]);
f.save();
