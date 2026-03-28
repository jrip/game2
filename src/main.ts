import './styles/main.css'
import { createGame } from '@/game/gameState'
import { mountEarth } from '@/game/earthGame'
import type { WorldZonesPayload } from '@/zones/worldData'
import { decodeLandBits } from '@/zones/worldData'

async function loadPayload(): Promise<WorldZonesPayload> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/zones.json`)
  if (!res.ok) throw new Error(`zones.json: ${res.status}`)
  return res.json() as Promise<WorldZonesPayload>
}

function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#globe')
  const overlay = document.querySelector<HTMLCanvasElement>('#dice-overlay')
  const hud = document.querySelector<HTMLElement>('#zone-hud')
  const turnHud = document.querySelector<HTMLElement>('#turn-hud')
  if (!canvas || !overlay || !hud) return

  loadPayload()
    .then((payload) => {
      const landBits = decodeLandBits(payload.landBits)
      const game = createGame(payload, landBits)
      const syncTurnHud = () => {
        if (!turnHud) return
        const p = game.currentPlayer
        const hint =
          game.phase === 'chooseAttacker'
            ? 'Выбери свою зону (от 2 кубиков) — начать атаку.'
            : `Выбери соседнюю вражескую зону (атака из ${game.attackerZone}; повторный клик по своей зоне — отмена).`
        turnHud.textContent = `Ход игрока ${p + 1}. ${hint} Игроки 1–4: синий, коралловый, зелёный, фиолетовый.`
      }
      syncTurnHud()
      hud.textContent =
        'Клик по суше: своя зона с 2+ кубиками → затем соседняя чужая. Океан в фазе цели — отмена атаки.'
      mountEarth(
        canvas,
        overlay,
        payload,
        (zoneId) => {
          const msg = game.onZoneClick(zoneId)
          hud.textContent = msg
          syncTurnHud()
        },
        () => game.getStacks(),
        () => game.currentPlayer,
      )
    })
    .catch((e) => {
      console.error(e)
      hud.textContent = 'Ошибка загрузки данных карты'
    })
}

main()
