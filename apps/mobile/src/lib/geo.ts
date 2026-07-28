// metres between two GPS points {lat, lng} — same maths as the server
export type GeoPoint = { lat: number; lng: number };
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
