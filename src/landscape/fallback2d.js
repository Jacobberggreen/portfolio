// Static 2D-canvas version of the scene for browsers without usable WebGL.
// Sky, mountain and the calm (unrippled) water are shaded with the same
// formulas as the shader at quarter resolution; a few soft perspective streaks
// stand in for the ripples.

import { SKY, WATER } from './params.js'
import { mulberry32 } from './random.js'

const sq = (x) => x * x

function skyL(xn, v, glowX) {
  const rise = Math.exp(-sq((v - 0.06) / SKY.glowRise))
  const side = 0.62 + 0.38 * Math.exp(-sq((xn - glowX) / SKY.glowWidth))
  const L = SKY.top + 0.03 * Math.exp(-v / 0.3) + SKY.glow * rise * side
  const e = Math.abs(xn - 0.5) * 2
  return L * (1 - 0.3 * e * e * e)
}

const COOL = SKY.tint.map((c) => c / Math.max(...SKY.tint))
const glowW = (xn, v, glowX) =>
  SKY.tintAmount * Math.exp(-sq((v - 0.06) / SKY.glowRise)) * (0.62 + 0.38 * Math.exp(-sq((xn - glowX) / SKY.glowWidth)))

const mountainL = (v) => SKY.mountain + SKY.mountainHaze * Math.exp(-Math.max(v, 0) / 0.025)

export function renderStatic2D(ctx, { width, height, scale, horizon, focal, sceneH, glowX, ridge }) {
  const W = width * scale
  const Hd = height * scale
  const q = 4 // shading resolution divisor
  const cw = Math.ceil(W / q)
  const ch = Math.ceil(Hd / q)
  const img = new ImageData(cw, ch)
  const d = img.data
  const ridgeBlur = (x) => {
    const i = Math.max(0, Math.min(ridge.n - 1, Math.round((x - ridge.x0) / ridge.step)))
    return ridge.blurred[i]
  }
  for (let j = 0; j < ch; j += 1) {
    const py = (j + 0.5) * q
    for (let i = 0; i < cw; i += 1) {
      const px = (i + 0.5) * q
      const xn = px / W
      let L
      let gT = 0
      if (py < horizon) {
        L = skyL(xn, (horizon - py) / sceneH, glowX)
        gT = glowW(xn, (horizon - py) / sceneH, glowX)
      } else {
        const dy = py - horizon
        const y = dy / sceneH
        const a = Math.atan(dy / focal)
        const blur = sceneH * 0.05
        const cov = Math.max(0, Math.min(1, 0.5 + (ridgeBlur(px) - dy) / (2 * blur)))
        const refl = skyL(xn, y, glowX) * (1 - cov) + mountainL(y) * cov
        const fres = 0.02 + 0.98 * (1 - Math.sin(a)) ** 5
        gT = SKY.tintWater * glowW(xn, y, glowX) * (1 - cov)
        L = WATER.reflect * fres * refl + WATER.base * Math.exp(-y / 0.12) + WATER.mist * Math.exp(-y / 0.012)
        const s = Math.max(0, Math.min(1, (y - 0.05) / (WATER.fade - 0.05)))
        L *= 1 - s * s * (3 - 2 * s)
        const e = Math.abs(xn - 0.5) * 2
        L *= 1 - 0.45 * e * e
      }
      gT = Math.min(gT, 2.5)
      const o = (j * cw + i) * 4
      const v = L * 255 + (((i * 7 + j * 13) % 5) - 2) * 0.25
      d[o] = v * (0.99 + (COOL[0] - 0.99) * gT)
      d[o + 1] = v * (1 + (COOL[1] - 1) * gT)
      d[o + 2] = v * (0.99 + (COOL[2] - 0.99) * gT)
      d[o + 3] = 255
    }
  }
  const tmp = document.createElement('canvas')
  tmp.width = cw
  tmp.height = ch
  tmp.getContext('2d').putImageData(img, 0, 0)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tmp, 0, 0, cw, horizon / q, 0, 0, W, horizon)
  ctx.drawImage(tmp, 0, horizon / q, cw, ch - horizon / q, 0, horizon, W, Hd - horizon)
  tmp.width = 0

  // Ripple streaks: long thin lenses near the horizon, fatter up close.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, horizon, W, Hd - horizon)
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  const rnd = mulberry32(21)
  for (let k = 0; k < 90; k += 1) {
    const y = 0.07 + rnd() ** 1.6 * 0.24 // fraction of scene height below the horizon
    const dy = y * sceneH
    const thick = Math.max(0.6 * scale, dy * 0.025 * (0.5 + rnd()))
    const len = W * (0.08 + rnd() * 0.3) * (1.2 - y * 2)
    const x = rnd() * W
    ctx.globalAlpha = (0.035 + rnd() * 0.05) * Math.max(0, 1 - y / WATER.fade)
    ctx.fillStyle = '#9a9c9a'
    ctx.beginPath()
    ctx.ellipse(x, horizon + dy, len / 2, thick / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Mountain silhouette on top, crisp, ending exactly on the horizon row.
  ctx.beginPath()
  ctx.moveTo(ridge.x0, horizon)
  for (let i = 0; i < ridge.n; i += 1) ctx.lineTo(ridge.x0 + i * ridge.step, horizon - ridge.heights[i])
  ctx.lineTo(ridge.x0 + (ridge.n - 1) * ridge.step, horizon)
  ctx.closePath()
  const peak = ridge.peakPx
  const fill = ctx.createLinearGradient(0, horizon - peak, 0, horizon)
  const m = (v) => Math.round(mountainL(v) * 255)
  fill.addColorStop(0, `rgb(${m(1)},${m(1)},${m(1)})`)
  fill.addColorStop(0.75, `rgb(${m(0.02)},${m(0.02)},${m(0.02)})`)
  fill.addColorStop(1, `rgb(${m(0)},${m(0)},${m(0)})`)
  ctx.fillStyle = fill
  ctx.fill()
}
