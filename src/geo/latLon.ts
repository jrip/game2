import type { Vec3 } from './sphereGeo'

/** Тот же переход, что у маркеров cobe: location [lat°, lon°] → единичный вектор. */
export function latLonDegToUnit(latDeg: number, lonDeg: number): Vec3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180 - Math.PI
  const cl = Math.cos(lat)
  return [-cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)]
}

export function nearestZoneByGeodesic(
  latDeg: number,
  lonDeg: number,
  zones: readonly { id: number; latDeg: number; lonDeg: number }[],
): number {
  const p = latLonDegToUnit(latDeg, lonDeg)
  let best = zones[0]?.id ?? 0
  let bestDot = -2
  for (const z of zones) {
    const q = latLonDegToUnit(z.latDeg, z.lonDeg)
    const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
    if (dot > bestDot) {
      bestDot = dot
      best = z.id
    }
  }
  return best
}
