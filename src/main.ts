import './styles/main.css'
import { createGameState } from '@/game/gameState'
import { mountEarth } from '@/game/earthGame'
import type { WorldZonesPayload } from '@/zones/worldData'
import { decodeLandBits } from '@/zones/worldData'

async function loadPayload(): Promise<WorldZonesPayload> {
  const res = await fetch('/data/zones.json')
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
      const game = createGameState(payload, landBits)
      const syncTurnHud = () => {
        if (!turnHud) return
        const p = game.currentPlayer
        turnHud.textContent = `Ход игрока ${p + 1} — его зоны подсвечены (ореол + лёгкая пульсация). Цвета: синий — игрок 1, красный — игрок 2`
      }
      syncTurnHud()
      mountEarth(
        canvas,
        overlay,
        payload,
        (zoneId) => {
          hud.textContent =
            zoneId === null
              ? 'Зона: — (океан или мимо шара)'
              : `Зона: ${zoneId}`
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
