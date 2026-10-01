// The single mountain range. The macro shape is traced from the reference
// photo (main summit ~30% in, then rolling humps and saddles stepping down to
// the right); a smooth spline plus a little soft noise keeps it gentle and
// rounded rather than alpine.

import { LAYOUT, MOUNTAINS } from './params.js'
import { clamp, lerp, makeNoise1D } from './random.js'

// [u, height relative to the main summit], measured from the reference.
// Left and right flanks carry about the same mass (same heights at mirrored
// distances from the summit, +/- the individual bumps) so the range feels balanced.
const PROFILE = [
  [-0.15, 0.22], [-0.08, 0.3], [0, 0.28], [0.06, 0.4], [0.12, 0.36], [0.18, 0.5],
  [0.23, 0.44], [0.29, 0.58], [0.34, 0.52], [0.39, 0.66], [0.43, 0.56], [0.465, 0.74],
  [0.5, 1], [0.525, 0.88], [0.55, 0.78], [0.575, 0.8], [0.61, 0.68], [0.65, 0.56], [0.7, 0.6],
  [0.74, 0.46], [0.8, 0.5], [0.85, 0.38], [0.9, 0.42], [0.95, 0.34], [1.02, 0.36],
  [1.1, 0.24], [1.18, 0.24], [1.25, 0.2],
]
const PROFILE_PEAK_U = 0.5

function spline(u) {
  let i = 1
  while (i < PROFILE.length - 3 && PROFILE[i + 1][0] < u) i += 1
  const [u1, p1] = PROFILE[i]
  const [u2, p2] = PROFILE[i + 1]
  const p0 = PROFILE[i - 1][1]
  const p3 = PROFILE[i + 2][1]
  const t = clamp((u - u1) / (u2 - u1), 0, 1)
  // Catmull-Rom (soft shoulders) blended with the straight segments (crisp
  // crests) so the range reads rolling but not blobby.
  const smooth =
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  const h = lerp(p1 + (p2 - p1) * t, smooth, 0.22)
  return 0.5 + (h - 0.5) * 1.0
}

// The other ranges are procedural: ridged noise gives pointed crests with
// saddles between them. Heights are fractions of the main summit; the farther
// ranges are taller and smoother, the nearer ones lower and more jagged.
const MAIN_LAYER = 2
const SPECS = [
  { seed: 5, base: 0.5, amp: 0.42, freq: 2.6, sharp: 1.5, detail: 0.02, env: 0.75 },
  { seed: 9, base: 0.4, amp: 0.4, freq: 3.6, sharp: 1.5, detail: 0.024, env: 0.65 },
  null, // main range: hand-traced profile below
  { seed: 13, base: 0.36, amp: 0.3, freq: 4.6, sharp: 1.6, detail: 0.03, env: 0.45 },
  { seed: 21, base: 0.26, amp: 0.24, freq: 5.6, sharp: 1.4, detail: 0.036, env: 0.4 },
]

function proceduralHeight(spec, noise, u) {
  const n = noise(u * spec.freq + spec.seed) * 0.65 + noise(u * spec.freq * 2.3 + spec.seed * 3.1) * 0.35
  const ridged = (1 - Math.abs(2 * n - 1)) ** spec.sharp
  // Every range swells toward the middle so the centre reads as the highest ground.
  const swell = 1 - spec.env * (1 - Math.exp(-(((u - 0.5) / 0.27) ** 2)))
  return swell * (spec.base + spec.amp * ridged) + spec.detail * (noise(u * 90 + spec.seed) - 0.5)
}

function boxBlur(src, radius) {
  const n = src.length
  const out = new Float32Array(n)
  let sum = 0
  const at = (i) => src[clamp(i, 0, n - 1)]
  for (let i = -radius; i <= radius; i += 1) sum += at(i)
  for (let i = 0; i < n; i += 1) {
    out[i] = sum / (radius * 2 + 1)
    sum += at(i + radius + 1) - at(i - radius)
  }
  return out
}

// Heights (device px above the horizon) sampled every `step` px from x0.
// `landscape` is 0 for a phone in portrait and 1 for a wide desktop.
export function buildRidge({ width, viewportHeight, landscape, margin, maxSamples = 2048 }) {
  const noise = makeNoise1D(1931)
  const span = lerp(LAYOUT.span[0], LAYOUT.span[1], landscape)
  const u0 = PROFILE_PEAK_U - LAYOUT.peakU * span
  const peakPx = viewportHeight * lerp(LAYOUT.peakHeight[0], LAYOUT.peakHeight[1], landscape)

  const x0 = -margin
  const total = width + margin * 2
  const n = Math.min(maxSamples, Math.ceil(total / 1.5) + 2)
  const step = total / (n - 2)
  const layers = SPECS.map((spec, li) => {
    const heights = new Float32Array(n)
    const layerNoise = makeNoise1D(700 + li)
    for (let i = 0; i < n; i += 1) {
      const px = x0 + i * step
      if (spec) {
        heights[i] = peakPx * proceduralHeight(spec, layerNoise, px / width)
        continue
      }
      const u = u0 + (px / width) * span
      const h = spline(u)
      const detail =
        0.028 * (noise(u * 22 + 2.3) - 0.5) + 0.016 * (noise(u * 61 + 7.1) - 0.5) + 0.008 * (noise(u * 170 + 3.7) - 0.5)
      heights[i] = peakPx * (h + detail * (0.4 + 0.6 * h))
    }
    return { heights }
  })
  // Balance: each range keeps its own peaks, but its slow-moving outline (a long
  // moving average, like a high-period EMA) is made mirror-symmetric about the
  // centre, so neither side of the screen feels heavier than the other.
  const envRadius = Math.max(2, Math.round((width * 0.07) / step))
  layers.forEach(({ heights: h }) => {
    const env = boxBlur(boxBlur(h, envRadius), envRadius)
    for (let i = 0; i < n; i += 1) {
      const balanced = 0.5 * (env[i] + env[n - 1 - i])
      h[i] = Math.max(0, h[i] + balanced - env[i])
    }
  })
  if (layers.length !== MOUNTAINS.length) throw new Error('SPECS and MOUNTAINS must list the same ranges')
  const heights = layers[MAIN_LAYER].heights
  // A heavily smoothed copy for the (rippled, never mirror-sharp) reflection.
  const radius = Math.max(2, Math.round((width * 0.05) / step))
  const blurred = boxBlur(boxBlur(heights, radius), radius)
  return { layers, mainRow: MAIN_LAYER, heights, blurred, x0, step, n, peakPx }
}
