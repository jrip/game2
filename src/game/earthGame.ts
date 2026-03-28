import * as THREE from 'three'
import type { WorldZonesPayload } from '@/zones/worldData'
import {
  decodeLandBits,
  isLandAtLonLat,
  landZoneIdsInPlay,
} from '@/zones/worldData'
import { latLonDegToUnit, nearestZoneByGeodesic } from '@/geo/latLon'
import { unitToLatLonDeg } from '@/geo/sphereGeo'
import type { PlayerId, ZoneStack } from '@/game/gameState'
import { drawDiceStack, stackPixelHeight } from '@/game/diceDraw'
import { publicAsset } from '@/publicAsset'

const DRAG_SENS = 0.006

function loadTexture(
  url: string,
  _renderer: THREE.WebGLRenderer,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        /** Без мипов: иначе на границах зон линейная фильтрация даёт ложные «полоски»
         *  (смесь соседних цветов → часто жёлтый/серый между зелёным и оранжевым). */
        tex.generateMipmaps = false
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = 1
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

export function mountEarth(
  canvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement | null,
  payload: WorldZonesPayload,
  onZonePick: (zoneId: number | null) => void,
  getStacks: () => ZoneStack[],
  getCurrentPlayer: () => PlayerId,
): () => void {
  const landBits = decodeLandBits(payload.landBits)
  const inPlay = new Set(landZoneIdsInPlay(payload, landBits))
  const zonesForPick = payload.zones.filter((z) => inPlay.has(z.id))

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  const dpr = window.devicePixelRatio || 1
  renderer.setPixelRatio(Math.min(Math.max(dpr, 1), 2.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  THREE.ColorManagement.enabled = true

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x060d18)

  /** Чуть шире угол и дальше камера — окружность шара помещается с полем. */
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 50)
  camera.position.set(0, 0, 2.92)

  const group = new THREE.Group()
  scene.add(group)

  scene.add(new THREE.AmbientLight(0xd8e4f2, 0.95))
  const hemi = new THREE.HemisphereLight(0xf0f5fa, 0x203a5c, 1.0)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.05)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const geometry = new THREE.SphereGeometry(1, 128, 64)
  let earth: THREE.Mesh | undefined

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const localHit = new THREE.Vector3()
  const worldPos = new THREE.Vector3()
  const clip = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const toCam = new THREE.Vector3()

  let rmbDown = false

  const onContextMenu = (e: MouseEvent) => e.preventDefault()

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 2) return
    rmbDown = true
    canvas.setPointerCapture(e.pointerId)
    canvas.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!rmbDown) return
    group.rotation.y += e.movementX * DRAG_SENS
    group.rotation.x += e.movementY * DRAG_SENS
    group.rotation.x = Math.max(
      -Math.PI * 0.45,
      Math.min(Math.PI * 0.45, group.rotation.x),
    )
  }

  const endRmb = (e: PointerEvent) => {
    if (!rmbDown) return
    rmbDown = false
    canvas.style.cursor = 'grab'
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
  }

  const pickFromClick = (e: MouseEvent) => {
    if (!earth) return
    if (e.button !== 0) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w < 2 || h < 2) return

    scene.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    ndc.x = (e.offsetX / w) * 2 - 1
    ndc.y = -(e.offsetY / h) * 2 + 1

    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(group.children, true)
    if (!hits.length || !hits[0].point) {
      onZonePick(null)
      return
    }

    /** Текстура equirectangular зашита в локальные координаты меша; группа крутится.
     * Без worldToLocal вектор смотрит «как неповёрнутый шар» → зона и маска суши уезжают на другую сторону. */
    earth.worldToLocal(localHit.copy(hits[0].point))
    const p = localHit.normalize()
    const { latDeg, lonDeg } = unitToLatLonDeg(p.x, p.y, p.z)

    if (!isLandAtLonLat(payload, landBits, lonDeg, latDeg)) {
      onZonePick(null)
      return
    }
    if (zonesForPick.length === 0) {
      onZonePick(null)
      return
    }
    onZonePick(nearestZoneByGeodesic(latDeg, lonDeg, zonesForPick))
  }

  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 2) endRmb(e)
  }

  const onPointerCancel = (e: PointerEvent) => {
    rmbDown = false
    canvas.style.cursor = 'grab'
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* */
    }
  }

  function setSize() {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    if (overlayCanvas) {
      const bw = canvas.width
      const bh = canvas.height
      overlayCanvas.width = bw
      overlayCanvas.height = bh
    }
  }

  const ro = new ResizeObserver(() => setSize())
  ro.observe(canvas)

  let raf = 0
  const tick = () => {
    renderer.render(scene, camera)
    if (overlayCanvas && earth) {
      const octx = overlayCanvas.getContext('2d')
      if (octx) {
        const w = overlayCanvas.width
        const h = overlayCanvas.height
        octx.clearRect(0, 0, w, h)
        scene.updateMatrixWorld(true)
        earth.updateMatrixWorld(true)
        const mw = earth.matrixWorld
        const turn = getCurrentPlayer()
        const now = performance.now()
        for (const s of getStacks()) {
          const [lx, ly, lz] = latLonDegToUnit(s.latDeg, s.lonDeg)
          worldPos.set(lx, ly, lz).multiplyScalar(1.055)
          worldPos.applyMatrix4(mw)
          normal.copy(worldPos).normalize()
          toCam.subVectors(camera.position, worldPos).normalize()
          if (normal.dot(toCam) < 0.08) continue

          clip.copy(worldPos).project(camera)
          if (Math.abs(clip.x) > 1.02 || Math.abs(clip.y) > 1.02) continue
          if (clip.z < -1 || clip.z > 1) continue

          const sx = (clip.x * 0.5 + 0.5) * w
          const sy = (-clip.y * 0.5 + 0.5) * h
          /** Нижний край столбика по умолчанию; сдвигаем вниз на полвысоты, чтобы центр столбика был на якоре. */
          const stackH = stackPixelHeight(s.dice)
          const syBottom = sy + stackH * 0.5
          drawDiceStack(octx, sx, syBottom, s.dice, s.owner, {
            isMyZone: s.owner === turn,
            isSelectedAttacker: s.isSelectedAttacker,
            timeMs: now,
          })
        }
      }
    }
    raf = requestAnimationFrame(tick)
  }

  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('click', pickFromClick)

  Object.assign(canvas.style, {
    width: 'min(92vw, 92svh, 92dvh, calc(100vw - 12px), calc(100svh - 12px))',
    height: 'min(92vw, 92svh, 92dvh, calc(100vw - 12px), calc(100svh - 12px))',
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
    margin: '0 auto',
    cursor: 'grab',
    touchAction: 'none',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>)

  if (overlayCanvas) {
    Object.assign(overlayCanvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '2',
    } satisfies Partial<CSSStyleDeclaration>)
  }

  const setup = loadTexture(publicAsset('data/earth-zones.png'), renderer).then(
    (map) => {
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.82,
      metalness: 0,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    })
    earth = new THREE.Mesh(geometry, mat)
    group.add(earth)
    setSize()
    tick()
  })

  let teardowned = false
  return () => {
    if (teardowned) return
    teardowned = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('contextmenu', onContextMenu)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerCancel)
    canvas.removeEventListener('click', pickFromClick)
    geometry.dispose()
    if (earth) {
      const m = earth.material as THREE.MeshStandardMaterial
      m.map?.dispose()
      m.dispose()
    }
    renderer.dispose()
    setup.catch(() => {})
  }
}
