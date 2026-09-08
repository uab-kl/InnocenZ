/** SVG data-URL placeholders for prototype uploads (IC, selfie, gallery). */
export function demoPlaceholderImage(
	title: string,
	subtitle?: string,
	accent = "#b79ce8",
	size: { w: number; h: number } = { w: 320, h: 400 },
): string {
	const sub = subtitle
		? `<text x="${size.w / 2}" y="${size.h * 0.57}" text-anchor="middle" fill="#928699" font-family="Manrope,sans-serif" font-size="13">${subtitle}</text>`
		: "";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">
    <rect width="${size.w}" height="${size.h}" rx="16" fill="#1a1228"/>
    <rect x="16" y="16" width="${size.w - 32}" height="${size.h - 32}" rx="12" fill="#241832" stroke="#3d2f4a" stroke-width="2"/>
    <text x="${size.w / 2}" y="${size.h * 0.49}" text-anchor="middle" fill="${accent}" font-family="Manrope,sans-serif" font-size="20" font-weight="700">${title}</text>
    ${sub}
  </svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
