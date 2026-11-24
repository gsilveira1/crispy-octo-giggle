import type { LatLon } from "./overpass.js";

const key = (p: LatLon) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;

/**
 * Junta segmentos de way (membros de uma relação) em anéis fechados.
 * Segmentos que não fecham (cortados pelo bbox) são descartados.
 */
export function assembleRings(segments: LatLon[][]): LatLon[][] {
  const pool = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: LatLon[][] = [];
  while (pool.length > 0) {
    let ring = pool.shift()!;
    let grew = true;
    while (key(ring[0]!) !== key(ring[ring.length - 1]!) && grew) {
      grew = false;
      const end = key(ring[ring.length - 1]!);
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]!;
        if (key(seg[0]!) === end) ring = ring.concat(seg.slice(1));
        else if (key(seg[seg.length - 1]!) === end) ring = ring.concat([...seg].reverse().slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]!) === key(ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

/** Ponto dentro de polígono (ray casting), em coordenadas planas. */
export function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
