import type { WorldZonesPayload } from '@/zones/worldData'
import { landZoneIdsInPlay } from '@/zones/worldData'
import {
  attackerCaptures,
  diceAfterCapture,
  rollBattle,
} from '@/game/battle'

export const PLAYER_COUNT = 4 as const
export type PlayerId = 0 | 1 | 2 | 3

export interface ZoneStack {
  zoneId: number
  latDeg: number
  lonDeg: number
  dice: number
  owner: PlayerId
  isSelectedAttacker?: boolean
}

export type GamePhase = 'chooseAttacker' | 'chooseDefender'

export interface GameApi {
  readonly landZoneIds: readonly number[]
  currentPlayer: PlayerId
  phase: GamePhase
  attackerZone: number | null
  getStacks(): ZoneStack[]
  onZoneClick(zoneId: number | null): string
}

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function neighborsOf(
  payload: WorldZonesPayload,
  z: number,
): readonly number[] {
  const n = payload.zoneNeighbors?.[z]
  return n ?? []
}

export function createGame(
  payload: WorldZonesPayload,
  landBits: Uint8Array,
): GameApi {
  const landZoneIds = landZoneIdsInPlay(payload, landBits)
  const rnd = () => {
    let s = 0x9e3779b9
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0x100000000
    }
  }
  const random = rnd()

  const dice = new Map<number, number>()
  const owner = new Map<number, PlayerId>()

  const assignOrder = [...landZoneIds]
  shuffleInPlace(assignOrder, random)
  assignOrder.forEach((id, i) => {
    owner.set(id, (i % PLAYER_COUNT) as PlayerId)
    dice.set(id, 2 + Math.floor(random() * 5))
  })

  const zoneById = new Map(payload.zones.map((z) => [z.id, z]))

  const countZones = (pid: PlayerId): number =>
    landZoneIds.filter((id) => owner.get(id) === pid).length

  const nextAlivePlayer = (after: PlayerId): PlayerId => {
    for (let s = 1; s <= PLAYER_COUNT; s++) {
      const p = ((after + s) % PLAYER_COUNT) as PlayerId
      if (countZones(p) > 0) return p
    }
    return after
  }

  const game: GameApi = {
    landZoneIds,
    currentPlayer: 0,
    phase: 'chooseAttacker',
    attackerZone: null,

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
          isSelectedAttacker:
            game.phase === 'chooseDefender' && game.attackerZone === id,
        })
      }
      return stacks
    },

    onZoneClick(zoneId: number | null): string {
      const gameOverLine = (): string | null => {
        const n = landZoneIds.length
        for (let pid = 0; pid < PLAYER_COUNT; pid++) {
          const c = countZones(pid as PlayerId)
          if (c === n && n > 0) {
            return `Победа игрока ${pid + 1} — все зоны захвачены.`
          }
        }
        return null
      }

      const over = gameOverLine()
      if (over) return over

      if (zoneId === null) {
        if (game.phase === 'chooseDefender') {
          game.phase = 'chooseAttacker'
          game.attackerZone = null
          return 'Выбор атаки отменён. Выбери свою зону (≥2 кубика).'
        }
        return 'Океан. Кликни по суше.'
      }

      if (!landZoneIds.includes(zoneId)) {
        return 'Эта зона не в партии.'
      }

      const dAtt = dice.get(zoneId) ?? 1
      const own = owner.get(zoneId) ?? 0

      if (game.phase === 'chooseAttacker') {
        if (own !== game.currentPlayer) {
          return `Не твоя зона — сейчас ход игрока ${game.currentPlayer + 1}.`
        }
        if (dAtt < 2) {
          return `В зоне ${zoneId} нужно минимум 2 кубика для атаки.`
        }
        game.attackerZone = zoneId
        game.phase = 'chooseDefender'
        return `Из зоны ${zoneId}: выбери соседнюю вражескую зону (клик по ${zoneId} — отмена).`
      }

      const from = game.attackerZone!
      if (zoneId === from) {
        game.phase = 'chooseAttacker'
        game.attackerZone = null
        return 'Отмена. Выбери свою зону для атаки.'
      }
      if (own === game.currentPlayer) {
        return 'Нужна вражеская зона (другой цвет).'
      }
      const nbr = neighborsOf(payload, from)
      if (!nbr.includes(zoneId)) {
        return `Зона ${zoneId} не соседствует с ${from}.`
      }

      const dDef = dice.get(zoneId) ?? 1
      const battle = rollBattle(dAtt, dDef, random)
      const aStr = battle.attackerRolls.join(',')
      const dStr = battle.defenderRolls.join(',')
      const cap = attackerCaptures(battle)

      if (cap) {
        const newDice = diceAfterCapture(battle)
        owner.set(zoneId, game.currentPlayer)
        dice.set(zoneId, newDice)
        dice.set(from, 1)
        game.phase = 'chooseAttacker'
        game.attackerZone = null
        game.currentPlayer = nextAlivePlayer(game.currentPlayer)
        const win = gameOverLine()
        const tail = win
          ? ` ${win}`
          : ` Дальше ходит игрок ${game.currentPlayer + 1}.`
        return `[${aStr}] vs [${dStr}] — захват! Зона ${zoneId}: ${newDice} куб., с ${from} снято (остался 1).${tail}`
      }

      dice.set(from, 1)
      game.phase = 'chooseAttacker'
      game.attackerZone = null
      game.currentPlayer = nextAlivePlayer(game.currentPlayer)
      return `[${aStr}] vs [${dStr}] — оборона. У зоны ${from} остался 1 куб. Ход игрока ${game.currentPlayer + 1}.`
    },
  }

  while (countZones(game.currentPlayer) === 0) {
    game.currentPlayer = ((game.currentPlayer + 1) % PLAYER_COUNT) as PlayerId
  }

  return game
}
