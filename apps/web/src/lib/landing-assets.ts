/**
 * All generated homepage / landing imagery lives in:
 * `public/img/landing/`
 *
 * Add new AI-generated or marketing photos there and reference them via
 * `landingImage()` or `LANDING_IMAGES` — do not use `/img/pr/` or temp paths.
 */
export const LANDING_IMAGE_DIR = "/img/landing" as const;

export function landingImage(filename: string) {
	return `${LANDING_IMAGE_DIR}/${filename}`;
}

export const LANDING_IMAGES = {
	heroBadge: landingImage("innocenz-hero-badge.png"),
	outletVenue: landingImage("venue-lounge.png"),
	prGroup: landingImage("pr-agency-team.png"),
	aiAbstract: landingImage("venue-neon-floor.png"),
	innocenzLogo: landingImage("innocenz-logo.png"),
	venueRooftop: landingImage("venue-rooftop.png"),
	venueLounge: landingImage("venue-lounge.png"),
	venueVip: landingImage("venue-vip.png"),
	venueBar: landingImage("venue-bar.png"),
	venueSkyline: landingImage("venue-skyline.png"),
	venueEntrance: landingImage("venue-entrance.png"),
	venueFloor: landingImage("venue-floor.png"),
	venueStaff: landingImage("venue-staff.png"),
	venueDj: landingImage("venue-dj.png"),
	venueCocktail: landingImage("venue-cocktail.png"),
	venuePool: landingImage("venue-pool.png"),
	venueNeonFloor: landingImage("venue-neon-floor.png"),
	prAgencyTeam: landingImage("pr-agency-team.png"),
	prAgencyOps: landingImage("pr-agency-ops.png"),
	prVipFloor: landingImage("pr-vip-floor.png"),
	agencyPortalDemo: landingImage("agency-portal-demo.png"),
	outletPortalDemo: landingImage("outlet-portal-demo.png"),
	prPortalDemo: landingImage("pr-portal-demo.png"),
	flowOutletVenue: landingImage("flow-outlet-venue.png"),
	flowAgencyPortrait: landingImage("flow-agency-portrait.png"),
	flowPrPortrait: landingImage("flow-pr-portrait.png"),
} as const;

export const landingGallery = [
	{ src: LANDING_IMAGES.venueRooftop, alt: "Rooftop venue at night" },
	{ src: LANDING_IMAGES.venueLounge, alt: "Luxury lounge interior" },
	{ src: LANDING_IMAGES.venueVip, alt: "VIP table service" },
	{ src: LANDING_IMAGES.venueBar, alt: "Premium bar setup" },
	{ src: LANDING_IMAGES.venueSkyline, alt: "City nightlife skyline" },
	{ src: LANDING_IMAGES.venueEntrance, alt: "Venue entrance" },
	{ src: LANDING_IMAGES.venueFloor, alt: "Venue floor overview" },
	{ src: LANDING_IMAGES.venueStaff, alt: "Hospitality team on the floor" },
	{ src: LANDING_IMAGES.venueDj, alt: "DJ booth and dance floor" },
	{ src: LANDING_IMAGES.venueCocktail, alt: "Neon cocktail bar" },
	{ src: LANDING_IMAGES.venuePool, alt: "Rooftop pool venue" },
	{ src: LANDING_IMAGES.venueNeonFloor, alt: "Neon-lit nightclub floor" },
	{ src: LANDING_IMAGES.prAgencyTeam, alt: "PR agency team coordination" },
	{ src: LANDING_IMAGES.prAgencyOps, alt: "PR agency operations on the floor" },
	{ src: LANDING_IMAGES.prVipFloor, alt: "VIP floor and table service" },
] as const;

/** Outer + inner floating portraits around the hero logo. */
export const heroPortraitFrames = [
	// Left arc — far edge
	{
		pos: "top-[1%] left-0 -translate-x-[10%]",
		rot: "-rotate-6",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.prAgencyTeam,
	},
	{
		pos: "top-[14%] left-[1%] -translate-x-[6%]",
		rot: "rotate-4",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.prAgencyOps,
	},
	{
		pos: "top-[28%] left-0 -translate-x-[12%]",
		rot: "-rotate-3",
		size: "w-28 xl:w-32",
		src: LANDING_IMAGES.venueLounge,
	},
	{
		pos: "top-[44%] left-[2%] -translate-x-[4%]",
		rot: "rotate-5",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueStaff,
	},
	{
		pos: "top-[60%] left-0 -translate-x-[10%]",
		rot: "-rotate-4",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueFloor,
	},
	{
		pos: "bottom-[22%] left-[1%] -translate-x-[8%]",
		rot: "rotate-3",
		size: "w-28 xl:w-32",
		src: LANDING_IMAGES.prVipFloor,
	},
	{
		pos: "bottom-[6%] left-[6%]",
		rot: "-rotate-5",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueEntrance,
	},
	{
		pos: "bottom-[38%] left-[3%] -translate-x-[6%]",
		rot: "rotate-6",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueCocktail,
	},
	// Left inner ring — beside the logo (circled gap)
	{
		pos: "top-[7%] left-[13%]",
		rot: "-rotate-5",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueVip,
	},
	{
		pos: "top-[16%] left-[20%]",
		rot: "rotate-3",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueDj,
	},
	{
		pos: "top-[4%] left-[24%]",
		rot: "-rotate-2",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venuePool,
	},
	// Right arc — far edge
	{
		pos: "top-[2%] right-0 translate-x-[10%]",
		rot: "rotate-6",
		size: "w-28 xl:w-32",
		src: LANDING_IMAGES.venueRooftop,
	},
	{
		pos: "top-[15%] right-[1%] translate-x-[6%]",
		rot: "-rotate-4",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueBar,
	},
	{
		pos: "top-[30%] right-0 translate-x-[12%]",
		rot: "rotate-3",
		size: "w-28 xl:w-32",
		src: LANDING_IMAGES.venueSkyline,
	},
	{
		pos: "top-[46%] right-[2%] translate-x-[4%]",
		rot: "-rotate-2",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueNeonFloor,
	},
	{
		pos: "top-[62%] right-0 translate-x-[10%]",
		rot: "rotate-5",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueFloor,
	},
	{
		pos: "bottom-[24%] right-[1%] translate-x-[8%]",
		rot: "-rotate-3",
		size: "w-28 xl:w-32",
		src: LANDING_IMAGES.venueLounge,
	},
	{
		pos: "bottom-[8%] right-[5%] translate-x-[4%]",
		rot: "rotate-4",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueDj,
	},
	{
		pos: "bottom-[40%] right-[3%] translate-x-[6%]",
		rot: "-rotate-6",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueCocktail,
	},
	// Right inner ring — beside the logo (circled gap)
	{
		pos: "top-[8%] right-[13%]",
		rot: "rotate-5",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueRooftop,
	},
	{
		pos: "top-[17%] right-[20%]",
		rot: "-rotate-3",
		size: "w-20 xl:w-24",
		src: LANDING_IMAGES.venueBar,
	},
	{
		pos: "top-[5%] right-[24%]",
		rot: "rotate-2",
		size: "w-24 xl:w-28",
		src: LANDING_IMAGES.venueSkyline,
	},
] as const;
