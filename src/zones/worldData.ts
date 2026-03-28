export interface ZoneDef {
  id: number
  latDeg: number
  lonDeg: number
}

export interface WorldZonesPayload {
  version: number
  mapWidth: number
  mapHeight: number
  landBits: string
  landThreshold: number
  zoneCount: number
  zones: ZoneDef[]
}

export function decodeLandBits(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function isLandPixel(
  landPackedBits: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return false
  const i = y * mapWidth + x
  const b = i >> 3
  const bit = i & 7
  return ((landPackedBits[b] ?? 0) & (1 << bit)) !== 0
}

/** Тот же центр пикселя, что в scripts/build-zones.mjs (pixelUnitVector / unitVec). */
export function lonLatDegToMapPixel(
  lonDeg: number,
  latDeg: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  let lon = lonDeg
  while (lon <= -180) lon += 360
  while (lon > 180) lon -= 360
  const u = (lon + 180) / 360
  const v = (90 - latDeg) / 180
  let x = Math.round(u * mapWidth - 0.5)
  x = ((x % mapWidth) + mapWidth) % mapWidth
  const y = Math.min(
    mapHeight - 1,
    Math.max(0, Math.round(v * mapHeight - 0.5)),
  )
  return { x, y }
}

export function isLandAtLonLat(
  payload: WorldZonesPayload,
  bits: Uint8Array,
  lonDeg: number,
  latDeg: number,
): boolean {
  const { x, y } = lonLatDegToMapPixel(
    lonDeg,
    latDeg,
    payload.mapWidth,
    payload.mapHeight,
  )
  return isLandPixel(bits, payload.mapWidth, payload.mapHeight, x, y)
}
