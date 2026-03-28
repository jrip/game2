/** Отрисовка столбика «армейских» кубиков (1…8) у точки экрана. */

function strokeFillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  mode: 'fill' | 'stroke' | 'both',
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
  if (mode === 'fill' || mode === 'both') ctx.fill()
  if (mode === 'stroke' || mode === 'both') ctx.stroke()
}

const OWNER_FILL = ['#3d6e9e', '#c45c52', '#3d9e6e', '#8b5cb8'] as const
const OWNER_STROKE = ['#8ec8ff', '#ffc4bc', '#9effc8', '#e8c4ff'] as const
const OWNER_DARK = ['#2a4a6a', '#8a3d38', '#2a5c44', '#5a3d72'] as const

const AURA_CORE: [number, number, number][] = [
  [160, 230, 255],
  [255, 200, 190],
  [180, 255, 210],
  [230, 210, 255],
]

export const DIE_W = 16
export const DIE_H = 13
export const DIE_GAP = 1

export function stackPixelHeight(diceCount: number): number {
  const n = Math.min(8, Math.max(1, Math.floor(diceCount)))
  return n * DIE_H + Math.max(0, n - 1) * DIE_GAP
}

function drawMyZoneAura(
  ctx: CanvasRenderingContext2D,
  cx: number,
  anchorBottomY: number,
  stackH: number,
  timeMs: number,
  playerIndex: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0026)
  const cy = anchorBottomY - stackH * 0.5
  const rx = 24 + pulse * 5
  const ry = 10 + stackH * 0.42 + pulse * 3
  const [r0, g0, b0] = AURA_CORE[Math.min(3, Math.max(0, playerIndex))]!
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry) * 1.4)
  g.addColorStop(0, `rgba(${r0}, ${g0}, ${b0}, ${0.35 + 0.2 * pulse})`)
  g.addColorStop(
    0.45,
    `rgba(${Math.round(r0 * 0.55)}, ${Math.round(g0 * 0.7)}, ${Math.round(b0 * 0.85)}, ${0.2 + 0.1 * pulse})`,
  )
  g.addColorStop(1, 'rgba(40, 90, 160, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(${Math.min(255, r0 + 40)}, ${Math.min(255, g0 + 45)}, ${Math.min(255, b0 + 35)}, ${0.35 + 0.25 * pulse})`
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])
  ctx.lineDashOffset = -(timeMs * 0.03) % 8
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx + 3, ry + 2, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawSelectedAttackerRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  anchorBottomY: number,
  stackH: number,
  timeMs: number,
): void {
  const cy = anchorBottomY - stackH * 0.5
  const rx = 22 + stackH * 0.12
  const ry = 8 + stackH * 0.38
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.004)
  ctx.save()
  ctx.strokeStyle = `rgba(255, 214, 90, ${0.75 + 0.2 * pulse})`
  ctx.lineWidth = 2.5
  ctx.setLineDash([6, 4])
  ctx.lineDashOffset = -(timeMs * 0.04) % 10
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx + 4, ry + 3, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = `rgba(255, 250, 200, ${0.5 + 0.25 * pulse})`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx + 2, ry + 1.5, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export function drawDiceStack(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  diceCount: number,
  owner: number,
  opts?: {
    isMyZone?: boolean
    isSelectedAttacker?: boolean
    timeMs?: number
  },
): void {
  const n = Math.min(8, Math.max(1, Math.floor(diceCount)))
  const oi = Math.min(OWNER_FILL.length - 1, Math.max(0, Math.floor(owner)))
  const fill = OWNER_FILL[oi]!
  const stroke = OWNER_STROKE[oi]!
  const dark = OWNER_DARK[oi]!
  const t = opts?.timeMs ?? 0
  const isMy = opts?.isMyZone ?? false
  const isSel = opts?.isSelectedAttacker ?? false
  const stackH = stackPixelHeight(n)

  if (isMy) {
    drawMyZoneAura(ctx, anchorX, anchorY, stackH, t, oi)
  }
  if (isSel) {
    drawSelectedAttackerRing(ctx, anchorX, anchorY, stackH, t)
  }

  const breathe = isMy ? 1 + 0.035 * Math.sin(t * 0.0033) : 1
  ctx.save()
  ctx.translate(anchorX, anchorY)
  ctx.scale(breathe, breathe)
  ctx.translate(-anchorX, -anchorY)

  for (let i = 0; i < n; i++) {
    const bottom = anchorY - i * (DIE_H + DIE_GAP)
    const left = anchorX - DIE_W / 2
    const r = 3

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    const g = ctx.createLinearGradient(
      left,
      bottom - DIE_H,
      left + DIE_W,
      bottom,
    )
    g.addColorStop(0, fill)
    g.addColorStop(1, dark)
    ctx.fillStyle = g
    strokeFillRoundRect(ctx, left, bottom - DIE_H, DIE_W, DIE_H, r, 'fill')
    ctx.restore()

    ctx.strokeStyle = isMy ? `rgba(220, 248, 255, 0.95)` : stroke
    ctx.lineWidth = isMy ? 1.6 : 1.25
    strokeFillRoundRect(ctx, left, bottom - DIE_H, DIE_W, DIE_H, r, 'stroke')

    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('1', anchorX, bottom - DIE_H / 2)
  }

  ctx.restore()
}
