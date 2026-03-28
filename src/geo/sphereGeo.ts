export type Vec3 = [number, number, number]

/** Единичный вектор на сфере (ось Y вверх, как в Three.js) → градусы; согласовано с latLonDegToUnit. */
export function unitToLatLonDeg(x: number, y: number, z: number): {
  latDeg: number
  lonDeg: number
} {
  const latDeg = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI
  const lonAdj = Math.atan2(z, -x)
  let lonDeg = ((lonAdj + Math.PI) * 180) / Math.PI
  if (lonDeg > 180) lonDeg -= 360
  return { latDeg, lonDeg }
}
