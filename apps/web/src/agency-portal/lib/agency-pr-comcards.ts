/** Agency PR roster seeded from uploaded comcard images (Manage PR grid). */

import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";

const COMCARD_BASE = "/assets/pr-comcards";

type ComcardSeed = Pick<
	AgencyManagedPR,
	| "id"
	| "name"
	| "age"
	| "height"
	| "weight"
	| "icName"
	| "ic"
	| "mobile"
	| "email"
>;

/**
 * Per-PR fields layered over the shared demo defaults below. `trainingLevel`
 * has no defensible shared default — it is a per-person grade, not a filler
 * value — so the base literal omits it and every entry must state it here.
 */
type ComcardOverrides = Omit<Partial<AgencyManagedPR>, "trainingLevel"> &
	Pick<AgencyManagedPR, "trainingLevel">;

function comcardPr(
	slug: string,
	seed: ComcardSeed,
	overrides: ComcardOverrides,
): AgencyManagedPR {
	const emailLocal = seed.email ?? `${slug.replace(/-/g, ".")}@inz.my`;
	return {
		id: seed.id,
		name: seed.name,
		icName: seed.icName,
		ic: seed.ic,
		mobile: seed.mobile,
		email: emailLocal,
		age: seed.age,
		height: seed.height,
		weight: seed.weight,
		race: "Chinese",
		languages: ["English", "Mandarin"],
		place: "KL",
		yearsExp: 2,
		rating: 4.6,
		totalPaid: 7200,
		attendancePct: 94,
		shiftsThisWeek: 4,
		lateThisWeek: 0,
		mcThisMonth: 0,
		checkIns: 18,
		checkOuts: 17,
		noShows: 0,
		kpiScore: 84,
		kpiTier: "B",
		tiedSince: "2024-08-01",
		comcardImageUrl: `${COMCARD_BASE}/${slug}.png`,
		...overrides,
	};
}

/** PRs with photo comcards — one image per person. */
export const SEED_COMCARD_AGENCY_PRS: AgencyManagedPR[] = [
	comcardPr(
		"bernice",
		{
			id: "pr-comcard-bernice",
			name: "Bernice",
			icName: "Bernice Lim Wei Ting",
			ic: "990415-08-1120",
			mobile: "+60 12-334 5566",
			email: "bernice@inz.my",
			age: 24,
			height: 162,
			weight: 47,
		},
		{ trainingLevel: "Tier II" },
	),
	comcardPr(
		"veron",
		{
			id: "pr-comcard-veron",
			name: "Veron",
			icName: "Veron Ng Siew Yee",
			ic: "980622-14-2231",
			mobile: "+60 16-445 7788",
			email: "veron@inz.my",
			age: 25,
			height: 166,
			weight: 50,
		},
		{
			trainingLevel: "Tier II",
			payClass: "commissionOnly",
			shiftsThisWeek: 2,
			lateThisWeek: 3,
			mcThisMonth: 1,
		},
	),
	comcardPr(
		"yvon",
		{
			id: "pr-comcard-yvon",
			name: "Yvon",
			icName: "Yvon Teh Yi Wen",
			ic: "970318-10-3342",
			mobile: "+60 11-556 8899",
			email: "yvon@inz.my",
			age: 26,
			height: 168,
			weight: 52,
		},
		{
			trainingLevel: "Tier I",
			payClass: "commissionOnly",
			shiftsThisWeek: 4,
			lateThisWeek: 0,
			mcThisMonth: 4,
		},
	),
	comcardPr(
		"xiao-bao",
		{
			id: "pr-comcard-xiao-bao",
			name: "Xiao Bao",
			icName: "Xiao Bao",
			ic: "010215-14-4453",
			mobile: "+60 18-667 9900",
			email: "xiao.bao@inz.my",
			age: 23,
			height: 164,
			weight: 50,
		},
		{ trainingLevel: "Tier V" },
	),
	comcardPr(
		"alice",
		{
			id: "pr-comcard-alice",
			name: "Alice",
			icName: "Alice Chen",
			ic: "990801-08-5564",
			mobile: "+60 17-778 0011",
			email: "alice@inz.my",
			age: 27,
			height: 165,
			weight: 48,
		},
		{ trainingLevel: "Tier I" },
	),
	comcardPr(
		"charlotte",
		{
			id: "pr-comcard-charlotte",
			name: "Charlotte",
			icName: "Charlotte Wong",
			ic: "000512-10-6675",
			mobile: "+60 19-889 1122",
			email: "charlotte@inz.my",
			age: 24,
			height: 165,
			weight: 45,
		},
		{ trainingLevel: "Tier II" },
	),
	comcardPr(
		"angie",
		{
			id: "pr-comcard-angie",
			name: "Angie",
			icName: "Angie Lim",
			ic: "990926-14-7786",
			mobile: "+60 12-990 2233",
			email: "angie@inz.my",
			age: 26,
			height: 168,
			weight: 54,
		},
		{ trainingLevel: "Tier I" },
	),
	comcardPr(
		"victoria",
		{
			id: "pr-comcard-victoria",
			name: "Victoria",
			icName: "Victoria Lee",
			ic: "980128-08-8897",
			mobile: "+60 16-101 3344",
			email: "victoria.comcard@inz.my",
			age: 28,
			height: 155,
			weight: 48,
		},
		{ trainingLevel: "Tier V" },
	),
	comcardPr(
		"moon",
		{
			id: "pr-comcard-moon",
			name: "Moon",
			icName: "Moon Tan",
			ic: "010823-10-9908",
			mobile: "+60 11-212 4455",
			email: "moon@inz.my",
			age: 23,
			height: 160,
			weight: 43,
		},
		{ trainingLevel: "Tier I" },
	),
	comcardPr(
		"sarah",
		{
			id: "pr-comcard-sarah",
			name: "Sarah",
			icName: "Sarah Ng",
			ic: "000305-14-1019",
			mobile: "+60 18-323 5566",
			email: "sarah@inz.my",
			age: 25,
			height: 170,
			weight: 59,
		},
		{ trainingLevel: "Tier III" },
	),
	comcardPr(
		"ava",
		{
			id: "pr-comcard-ava",
			name: "Ava",
			icName: "Ava Ho",
			ic: "010710-08-2130",
			mobile: "+60 17-434 6677",
			email: "ava@inz.my",
			age: 23,
			height: 164,
			weight: 48,
		},
		{ trainingLevel: "Tier I" },
	),
	comcardPr(
		"zoe",
		{
			id: "pr-comcard-zoe",
			name: "Zoe",
			icName: "Zoe Chua",
			ic: "040601-10-3241",
			mobile: "+60 19-545 7788",
			email: "zoe@inz.my",
			age: 21,
			height: 159,
			weight: 49,
		},
		{ trainingLevel: "Tier II" },
	),
	comcardPr(
		"karyan",
		{
			id: "pr-comcard-karyan",
			name: "KarYan",
			icName: "Kar Yan Lim",
			ic: "990918-14-4352",
			mobile: "+60 12-656 8899",
			email: "karyan@inz.my",
			age: 24,
			height: 156,
			weight: 44,
		},
		{ trainingLevel: "Tier III" },
	),
	comcardPr(
		"winnie",
		{
			id: "pr-comcard-winnie",
			name: "Winnie",
			icName: "Winnie Teo",
			ic: "010224-08-5463",
			mobile: "+60 16-767 9900",
			email: "winnie@inz.my",
			age: 24,
			height: 160,
			weight: 46,
		},
		{ trainingLevel: "Tier IV" },
	),
	comcardPr(
		"hazel",
		{
			id: "pr-comcard-hazel",
			name: "Hazel",
			icName: "Hazel Ong",
			ic: "000811-10-6574",
			mobile: "+60 11-878 0011",
			email: "hazel@inz.my",
			age: 25,
			height: 168,
			weight: 47,
		},
		{ trainingLevel: "Tier IV" },
	),
	comcardPr(
		"grace",
		{
			id: "pr-comcard-grace",
			name: "Grace",
			icName: "Grace Tan",
			ic: "990427-14-7685",
			mobile: "+60 18-989 1122",
			email: "grace@inz.my",
			age: 24,
			height: 155,
			weight: 52,
		},
		{ trainingLevel: "Tier IV" },
	),
	comcardPr(
		"jes",
		{
			id: "pr-comcard-jes",
			name: "Jes",
			icName: "Jeslyn Koh",
			ic: "010615-08-8796",
			mobile: "+60 17-090 2233",
			email: "jes@inz.my",
			age: 24,
			height: 160,
			weight: 50,
		},
		{ trainingLevel: "Tier III" },
	),
	comcardPr(
		"wei-qi",
		{
			id: "pr-comcard-wei-qi",
			name: "Wei Qi",
			icName: "Wei Qi Lim",
			ic: "030422-10-9807",
			mobile: "+60 19-101 3344",
			email: "wei.qi@inz.my",
			age: 22,
			height: 163,
			weight: 46,
		},
		{ trainingLevel: "Tier II" },
	),
	comcardPr(
		"gin",
		{
			id: "pr-comcard-gin",
			name: "Gin",
			icName: "Gin Lee",
			ic: "000109-14-0918",
			mobile: "+60 12-212 4455",
			email: "gin@inz.my",
			age: 24,
			height: 158,
			weight: 46,
		},
		{ trainingLevel: "Tier IV" },
	),
];
