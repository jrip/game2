import './styles/main.css'
import { mountEarth } from '@/game/earthGame'
import type { WorldZonesPayload } from '@/zones/worldData'

async function loadPayload(): Promise<WorldZonesPayload> {
  const res = await fetch('/data/zones.json')
  if (!res.ok) throw new Error(`zones.json: ${res.status}`)
  return res.json() as Promise<WorldZonesPayload>
}

function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#globe')
  const hud = document.querySelector<HTMLElement>('#zone-hud')
  if (!canvas || !hud) return

  loadPayload()
    .then((payload) => {
      mountEarth(canvas, payload, (zoneId) => {
        hud.textContent =
          zoneId === null ? 'Зона: — (океан или мимо шара)' : `Зона: ${zoneId}`
      })
    })
    .catch((e) => {
      console.error(e)
      hud.textContent = 'Ошибка загрузки данных карты'
    })
}

main()
