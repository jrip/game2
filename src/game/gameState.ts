import type { WorldZonesPayload } from '@/zones/worldData'
import { isLandAtLonLat } from '@/zones/worldData'

export interface ZoneStack {
  zoneId: number
  /** Позиция столбика кубиков (центр суши в зоне, иначе центроид сайта). */
  latDeg: number
  lonDeg: number
  dice: number
  owner: 0 | 1
}

export interface GameState {
  readonly landZoneIds: readonly number[]
  getStacks(): ZoneStack[]
  currentPlayer: 0 | 1
}

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * Зоны с сушей: предпочтительно `landZoneIds` из zones.json (факт по пикселям),
 * иначе эвристика по центроиду сайта (старые данные без поля).
 */
function landZoneIdsFromPayload(
  payload: WorldZonesPayload,
  landBits: Uint8Array,
): number[] {
  if (payload.landZoneIds && payload.landZoneIds.length > 0) {
    return [...payload.landZoneIds]
  }
  const out: number[] = []
  for (const z of payload.zones) {
    if (isLandAtLonLat(payload, landBits, z.lonDeg, z.latDeg)) {
      out.push(z.id)
    }
  }
  return out
}

export function createGameState(
  payload: WorldZonesPayload,
  landBits: Uint8Array,
): GameState {
  const landZoneIds = landZoneIdsFromPayload(payload, landBits)
  const rnd = () => {
    let s = 0x9e3779b9
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0x100000000
    }
  }
  const random = rnd()

  const dice = new Map<number, number>()
  const owner = new Map<number, 0 | 1>()

  const ids = [...landZoneIds]
  shuffleInPlace(ids, random)

  ids.forEach((id, i) => {
    owner.set(id, (i % 2) as 0 | 1)
    dice.set(id, 2 + Math.floor(random() * 5))
  })

  const zoneById = new Map(payload.zones.map((z) => [z.id, z]))

  return {
    landZoneIds: ids,
    currentPlayer: 0,
    getStacks(): ZoneStack[] {
      const stacks: ZoneStack[] = []
      for (const id of landZoneIds) {
        const z = zoneById.get(id)
        if (!z) continue
        const d = dice.get(id) ?? 1
        stacks.push({
          zoneId: id,
          latDeg: z.anchorLatDeg ?? z.latDeg,
          lonDeg: z.anchorLonDeg ?? z.lonDeg,
          dice: Math.min(8, Math.max(1, d)),
          owner: owner.get(id) ?? 0,
        })
      }
      return stacks
    },
  }
}
