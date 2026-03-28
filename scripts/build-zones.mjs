/**
 * Землеподобная карта:
 * - сначала строим чистый сферический Вороной (128 зон),
 * - затем выбираем "сушу" целыми ячейками вокруг якорей материков,
 * - поэтому сегменты на суше не накладываются и остаются выпуклыми ячейками Вороного.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const ZONE_COUNT = 128
const TEXTURE_W = 2048
const TEXTURE_H = 1024
const LLOYD_ITERS = 16
const JITTER = 0.06

function normalize3([x, y, z]) {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x))
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function lonLatDegToVec(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180 - Math.PI
  const cl = Math.cos(lat)
  return [-cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)]
}

function vecToLonLat(v) {
  const m = normalize3(v)
  const lat = Math.asin(m[1])
  const cosLat = Math.cos(lat)
  const t = clamp(cosLat === 0 ? 0 : -m[0] / cosLat, -1, 1)
  let lon = Math.acos(t)
  if (m[2] < 0) lon = -lon
  return { lon, lat }
}

function geodesicDeg(a, b) {
  return (Math.acos(clamp(dot3(a, b), -1, 1)) * 180) / Math.PI
}

function wrapX(x, w) {
  let nx = x % w
  if (nx < 0) nx += w
  return nx
}

function pixelUnitVector(x, y, W, H) {
  const u = (x + 0.5) / W
  const v = (y + 0.5) / H
  const lonDeg = u * 360 - 180
  const latDeg = 90 - v * 180
  return lonLatDegToVec(latDeg, lonDeg)
}

function hslToRgb(h, s, l) {
  let r
  let g
  let b
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (p_, q_, t) => {
      let tt = t
      if (tt < 0) tt += 1
      if (tt > 1) tt -= 1
      if (tt < 1 / 6) return p_ + (q_ - p_) * 6 * tt
      if (tt < 1 / 2) return q_
      if (tt < 2 / 3) return p_ + (q_ - p_) * (2 / 3 - tt) * 6
      return p_
    }
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function zoneLandRgb(id) {
  const h = (id * 0.618033988749895) % 1
  return hslToRgb(h, 0.62, 0.52)
}

function fibonacciZoneAxes(n) {
  const g = (Math.sqrt(5) + 1) / 2
  const out = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = (2 * Math.PI * i) / g
    out.push(normalize3([Math.cos(th) * r, y, Math.sin(th) * r]))
  }
  return out
}

function jitterVec(v, amp) {
  return normalize3([
    v[0] + (Math.random() * 2 - 1) * amp,
    v[1] + (Math.random() * 2 - 1) * amp,
    v[2] + (Math.random() * 2 - 1) * amp,
  ])
}

function assignVoronoiSphereAll(W, H, zoneVecs) {
  const K = zoneVecs.length
  const zId = new Int32Array(W * H)
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const p = pixelUnitVector(x, y, W, H)
      let best = 0
      let bestDot = -2
      for (let z = 0; z < K; z++) {
        const d = dot3(p, zoneVecs[z])
        if (d > bestDot) {
          bestDot = d
          best = z
        }
      }
      zId[row + x] = best
    }
  }
  return zId
}

function recomputeZoneVectorsAll(W, H, zId, K) {
  const sum = Array.from({ length: K }, () => [0, 0, 0])
  const cnt = new Int32Array(K)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const z = zId[i]
      const p = pixelUnitVector(x, y, W, H)
      sum[z][0] += p[0]
      sum[z][1] += p[1]
      sum[z][2] += p[2]
      cnt[z]++
    }
  }
  const out = []
  let zMax = 0
  for (let z = 1; z < K; z++) if (cnt[z] > cnt[zMax]) zMax = z
  for (let z = 0; z < K; z++) {
    if (cnt[z] === 0) out.push(jitterVec([0, 1, 0], 0.25))
    else {
      out.push(
        normalize3([
          sum[z][0] / cnt[z],
          sum[z][1] / cnt[z],
          sum[z][2] / cnt[z],
        ]),
      )
    }
  }
  if (cnt[zMax] === 0) return out
  return out
}

function lloydRelaxSphere(W, H, zId, zoneVecs, iters) {
  for (let i = 0; i < iters; i++) {
    const nv = recomputeZoneVectorsAll(W, H, zId, zoneVecs.length)
    for (let z = 0; z < zoneVecs.length; z++) {
      zoneVecs[z][0] = nv[z][0]
      zoneVecs[z][1] = nv[z][1]
      zoneVecs[z][2] = nv[z][2]
    }
    const next = assignVoronoiSphereAll(W, H, zoneVecs)
    zId.set(next)
  }
}

function sealCentroidVoronoi(W, H, zId, zoneVecs, rounds = 10) {
  for (let s = 0; s < rounds; s++) {
    const nv = recomputeZoneVectorsAll(W, H, zId, zoneVecs.length)
    for (let z = 0; z < zoneVecs.length; z++) {
      zoneVecs[z][0] = nv[z][0]
      zoneVecs[z][1] = nv[z][1]
      zoneVecs[z][2] = nv[z][2]
    }
    const next = assignVoronoiSphereAll(W, H, zoneVecs)
    let diff = 0
    for (let i = 0; i < zId.length; i++) if (zId[i] !== next[i]) diff++
    zId.set(next)
    if (diff === 0) break
  }
}

function buildZoneAdjacency(zAll, W, H, K) {
  const adj = Array.from({ length: K }, () => new Set())
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const i = row + x
      const a = zAll[i]
      const xr = wrapX(x + 1, W)
      const yr = y + 1
      const b = zAll[row + xr]
      if (a !== b) {
        adj[a].add(b)
        adj[b].add(a)
      }
      if (yr < H) {
        const c = zAll[yr * W + x]
        if (a !== c) {
          adj[a].add(c)
          adj[c].add(a)
        }
      }
    }
  }
  return adj
}

function zoneLatLon(zoneVecs, z) {
  const { lon, lat } = vecToLonLat(zoneVecs[z])
  return { lonDeg: (lon * 180) / Math.PI, latDeg: (lat * 180) / Math.PI }
}

function pickNearestUnclaimed(zoneVecs, claimed, centerVec, maxDeg = 180) {
  let best = -1
  let bestDeg = Infinity
  for (let z = 0; z < zoneVecs.length; z++) {
    if (claimed[z] >= 0) continue
    const d = geodesicDeg(zoneVecs[z], centerVec)
    if (d > maxDeg) continue
    if (d < bestDeg) {
      bestDeg = d
      best = z
    }
  }
  return best
}

function growContinent({
  zoneVecs,
  adjacency,
  claimed,
  centerVec,
  centerLatDeg,
  target,
  maxDeg,
  tag,
}) {
  const seed = pickNearestUnclaimed(zoneVecs, claimed, centerVec, maxDeg * 1.25)
  if (seed < 0) return []
  const out = [seed]
  claimed[seed] = tag
  const inCont = new Uint8Array(zoneVecs.length)
  inCont[seed] = 1

  while (out.length < target) {
    let best = -1
    let bestScore = Infinity

    for (const z of out) {
      for (const n of adjacency[z]) {
        if (claimed[n] >= 0 || inCont[n]) continue
        const d = geodesicDeg(zoneVecs[n], centerVec)
        if (d > maxDeg) continue
        const { latDeg } = zoneLatLon(zoneVecs, n)
        const latPenalty = Math.abs(latDeg - centerLatDeg) * 0.18
        const score = d + latPenalty
        if (score < bestScore) {
          bestScore = score
          best = n
        }
      }
    }

    if (best < 0) {
      best = pickNearestUnclaimed(zoneVecs, claimed, centerVec, maxDeg * 1.45)
      if (best < 0) break
    }
    out.push(best)
    inCont[best] = 1
    claimed[best] = tag
  }
  return out
}

function buildEarthLikeLandZones(zoneVecs, adjacency) {
  const specs = [
    { name: 'NA', lat: 47, lon: -103, target: 12, maxDeg: 43 },
    { name: 'SA', lat: -17, lon: -61, target: 9, maxDeg: 36 },
    { name: 'EUAS', lat: 50, lon: 68, target: 20, maxDeg: 56 },
    { name: 'AF', lat: 8, lon: 23, target: 12, maxDeg: 39 },
    { name: 'AUS', lat: -26, lon: 134, target: 5, maxDeg: 26 },
    { name: 'GR', lat: 72, lon: -41, target: 2, maxDeg: 18 },
    { name: 'ANT', lat: -76, lon: 20, target: 7, maxDeg: 35 },
  ]

  const claimed = new Int16Array(zoneVecs.length)
  claimed.fill(-1)
  const landZones = new Set()

  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i]
    const centerVec = lonLatDegToVec(sp.lat, sp.lon)
    const part = growContinent({
      zoneVecs,
      adjacency,
      claimed,
      centerVec,
      centerLatDeg: sp.lat,
      target: sp.target,
      maxDeg: sp.maxDeg,
      tag: i,
    })
    for (const z of part) landZones.add(z)
  }

  // Доп. острова отключены: так суша ближе к крупным связным материкам.

  return landZones
}

function zonesToLandMask(zAll, landZones) {
  const land = new Uint8Array(zAll.length)
  const zLand = new Int32Array(zAll.length)
  zLand.fill(-1)
  for (let i = 0; i < zAll.length; i++) {
    const z = zAll[i]
    if (!landZones.has(z)) continue
    land[i] = 1
    zLand[i] = z
  }
  return { land, zLand }
}

function validateLandZones(land, zId, W, H, zoneVecs) {
  const K = zoneVecs.length
  let landBad = 0
  let oceanBad = 0
  let nLand = 0
  const nz = new Int32Array(K)

  for (let i = 0; i < land.length; i++) {
    if (land[i]) {
      nLand++
      const z = zId[i]
      if (z < 0 || z >= K) landBad++
      else nz[z]++
    } else if (zId[i] !== -1) oceanBad++
  }

  let voronoiViol = 0
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const i = row + x
      if (!land[i]) continue
      const p = pixelUnitVector(x, y, W, H)
      let best = 0
      let bestDot = -2
      for (let z = 0; z < K; z++) {
        const d = dot3(p, zoneVecs[z])
        if (d > bestDot) {
          bestDot = d
          best = z
        }
      }
      if (best !== zId[i]) voronoiViol++
    }
  }

  return {
    nLand,
    landBad,
    oceanBad,
    voronoiViol,
    sumNz: nz.reduce((a, b) => a + b, 0),
  }
}

function writeStylizedTexture(land, zId, W, H, outPath) {
  const out = new PNG({ width: W, height: H })
  const setPx = (i, rgb) => {
    const j = i << 2
    out.data[j] = rgb[0]
    out.data[j + 1] = rgb[1]
    out.data[j + 2] = rgb[2]
    out.data[j + 3] = 255
  }

  const OCEAN_DEEP = [12, 32, 58]
  const OCEAN_SHOAL = [22, 52, 88]
  const borderRgb = [22, 28, 38]
  const dirs4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  for (let y = 0; y < H; y++) {
    const latFade = 1 - Math.min(1, Math.abs(((y + 0.5) / H) * 2 - 1) * 1.05)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!land[i]) {
        setPx(i, OCEAN_DEEP)
        continue
      }
      const [r, g, b] = zoneLandRgb(zId[i])
      const lift = 0.88 + 0.12 * latFade
      setPx(i, [
        Math.min(255, Math.round(r * lift)),
        Math.min(255, Math.round(g * lift)),
        Math.min(255, Math.round(b * lift)),
      ])
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!land[i]) {
        let nearLand = false
        for (const [dx, dy] of dirs4) {
          const nx = (x + dx + W) % W
          const ny = y + dy
          if (ny < 0 || ny >= H) continue
          if (land[ny * W + nx]) {
            nearLand = true
            break
          }
        }
        if (nearLand) setPx(i, OCEAN_SHOAL)
        continue
      }

      const mine = zId[i]
      let edgeOcean = false
      for (const [dx, dy] of dirs4) {
        const nx = (x + dx + W) % W
        const ny = y + dy
        if (ny < 0 || ny >= H) continue
        if (!land[ny * W + nx]) {
          edgeOcean = true
          break
        }
      }

      let edgeZone = false
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = (x + dx + W) % W
          const ny = y + dy
          if (ny < 0 || ny >= H) continue
          const ni = ny * W + nx
          if (!land[ni]) continue
          if (zId[ni] !== mine) {
            edgeZone = true
            break
          }
        }
        if (edgeZone) break
      }

      if (edgeZone) {
        setPx(i, borderRgb)
      } else if (edgeOcean) {
        const [r, g, b] = zoneLandRgb(mine)
        setPx(i, [
          Math.min(255, Math.round(r * 0.75 + 28)),
          Math.min(255, Math.round(g * 0.78 + 44)),
          Math.min(255, Math.round(b * 0.72 + 52)),
        ])
      }
    }
  }

  fs.writeFileSync(outPath, PNG.sync.write(out))
}

function vectorsToZoneRecords(vecs) {
  return vecs.map((v, id) => {
    const { lon, lat } = vecToLonLat(v)
    return {
      id,
      latDeg: (lat * 180) / Math.PI,
      lonDeg: (lon * 180) / Math.PI,
    }
  })
}

function packBits(land, w, h) {
  const bytes = Math.ceil((w * h) / 8)
  const out = new Uint8Array(bytes)
  for (let i = 0; i < w * h; i++) {
    if (!land[i]) continue
    out[i >> 3] |= 1 << (i & 7)
  }
  return out
}

function main() {
  let zoneVecs = fibonacciZoneAxes(ZONE_COUNT)
  for (let z = 0; z < ZONE_COUNT; z++) zoneVecs[z] = jitterVec(zoneVecs[z], JITTER)

  const zAll = assignVoronoiSphereAll(TEXTURE_W, TEXTURE_H, zoneVecs)
  lloydRelaxSphere(TEXTURE_W, TEXTURE_H, zAll, zoneVecs, LLOYD_ITERS)
  sealCentroidVoronoi(TEXTURE_W, TEXTURE_H, zAll, zoneVecs, 10)

  const adjacency = buildZoneAdjacency(zAll, TEXTURE_W, TEXTURE_H, ZONE_COUNT)
  const landZones = buildEarthLikeLandZones(zoneVecs, adjacency)
  const { land, zLand } = zonesToLandMask(zAll, landZones)

  const check = validateLandZones(land, zLand, TEXTURE_W, TEXTURE_H, zoneVecs)
  if (check.landBad !== 0 || check.oceanBad !== 0) {
    throw new Error(
      `Некорректная разметка: landBad=${check.landBad}, oceanBad=${check.oceanBad}`,
    )
  }
  if (check.sumNz !== check.nLand) {
    throw new Error(`Сумма зон ${check.sumNz} не равна суше ${check.nLand}`)
  }
  if (check.voronoiViol !== 0) {
    throw new Error(
      `Нарушение чистого Вороного на суше: ${check.voronoiViol} px`,
    )
  }

  const zoneRecords = vectorsToZoneRecords(zoneVecs)
  const landPacked = packBits(land, TEXTURE_W, TEXTURE_H)
  const outDir = path.join(root, 'public/data')
  fs.mkdirSync(outDir, { recursive: true })

  writeStylizedTexture(
    land,
    zLand,
    TEXTURE_W,
    TEXTURE_H,
    path.join(outDir, 'earth-zones.png'),
  )

  const nz = new Int32Array(ZONE_COUNT)
  for (let i = 0; i < zLand.length; i++) if (land[i]) nz[zLand[i]]++
  let zmin = Infinity
  let zmax = 0
  for (let z = 0; z < ZONE_COUNT; z++) {
    if (nz[z] === 0) continue
    zmin = Math.min(zmin, nz[z])
    zmax = Math.max(zmax, nz[z])
  }

  const payload = {
    version: 1,
    mapWidth: TEXTURE_W,
    mapHeight: TEXTURE_H,
    landBits: Buffer.from(landPacked).toString('base64'),
    landThreshold: 0,
    zoneCount: ZONE_COUNT,
    zones: zoneRecords,
  }
  fs.writeFileSync(path.join(outDir, 'zones.json'), JSON.stringify(payload), 'utf8')

  const avgLandZone = (check.nLand / Math.max(1, landZones.size)).toFixed(0)
  console.log(
    `OK: суша ${check.nLand.toLocaleString()} px, land-зон ${landZones.size}, min/max ${zmin}/${zmax}, ср. ${avgLandZone}`,
  )
}

try {
  main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
