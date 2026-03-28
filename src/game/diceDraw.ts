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

const OWNER_FILL = ['#3d6e9e', '#b85c52'] as const
const OWNER_STROKE = ['#8ec8ff', '#ffc4bc'] as const
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
): void {
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0026)
  const cy = anchorBottomY - stackH * 0.5
  const rx = 24 + pulse * 5
  const ry = 10 + stackH * 0.42 + pulse * 3
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry) * 1.4)
  g.addColorStop(0, `rgba(160, 230, 255, ${0.35 + 0.2 * pulse})`)
  g.addColorStop(0.45, `rgba(90, 180, 255, ${0.2 + 0.1 * pulse})`)
  g.addColorStop(1, 'rgba(40, 90, 160, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(200, 245, 255, ${0.35 + 0.25 * pulse})`
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])
  ctx.lineDashOffset = -(timeMs * 0.03) % 8
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx + 3, ry + 2, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

export function drawDiceStack(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  diceCount: number,
  owner: 0 | 1,
  opts?: { isMyZone?: boolean; timeMs?: number },
): void {
  const n = Math.min(8, Math.max(1, Math.floor(diceCount)))
  const fill = OWNER_FILL[owner]
  const stroke = OWNER_STROKE[owner]
  const t = opts?.timeMs ?? 0
  const isMy = opts?.isMyZone ?? false
  const stackH = stackPixelHeight(n)

  if (isMy) {
    drawMyZoneAura(ctx, anchorX, anchorY, stackH, t)
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
    g.addColorStop(1, owner === 0 ? '#2a4a6a' : '#8a3d38')
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
