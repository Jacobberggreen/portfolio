// Hero backdrop: a charcoal sky glowing toward the horizon, one dark mountain
// range and a calm lake whose ripples slowly roll toward the viewer.
//
// createLandscape(host) mounts a canvas into `host` and returns destroy().
// WebGL draws everything in a single full-screen pass (see shader.js); without
// WebGL a static 2D render of the same scene is shown instead.

import { buildRidge } from './ridge.js'
import { createGLRenderer } from './glRenderer.js'
import { renderStatic2D } from './fallback2d.js'
import { LAYOUT, MOTION, PAGE, PERF, SKY, WATER } from './params.js'
import { RING_MAX, SHOOT_MAX } from './shader.js'
import { clamp, lerp } from './random.js'

const THEME_FADE = 600 // ms; same as the page's colour transition (see :root in styles.css)
const MARGIN = 16 // css px of ridge beyond each edge (mouse parallax)
const MAX_PIXELS = { desktop: PERF.desktopPixels, mobile: 1.8e6 } // internal resolution budget
const FOCAL = 1.0 // focal length in scene heights (sets the perspective strength)

// How much of `occlude`'s height the range may hide, measured up from its bottom edge.
// The element sits behind this range (0 = farthest) and every nearer one; farther ranges stay behind it.
const RING_SECONDS = 4
const CLICK_IGNORE = 'a, button, input, textarea, select, label, [role="button"]'

const OCCLUDE_LAYER = 3
const MAX_HIDDEN = 0.34

export function createLandscape(host, { occlude = null } = {}) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let canvas = document.createElement('canvas')
  canvas.className = 'hero-landscape__canvas'
  host.appendChild(canvas)

  // A frozen copy of the previous theme's frame that fades out over the live canvas when the theme changes.
  // The fade is a plain CSS opacity transition (composited by the GPU), so it stays smooth even though the
  // shader underneath cannot keep 60 fps while the rest of the page is repainting its colours.
  const ghost = document.createElement('canvas')
  ghost.className = 'hero-landscape__ghost'
  host.appendChild(ghost)

  let renderer = createGLRenderer(canvas)
  if (renderer && !renderer.init()) {
    // The context exists but the shader failed: a canvas cannot switch
    // context type, so start over with a fresh one for the 2D fallback.
    renderer.dispose()
    renderer = null
    const fresh = canvas.cloneNode()
    canvas.replaceWith(fresh)
    canvas = fresh
  }
  const ctx2d = renderer ? null : canvas.getContext('2d')

  let W = 0
  let H = 0
  let scale = 1
  let quality = 1 // lowered at runtime if frames are slow
  let small = false
  let ridge = null
  let contextLost = false

  let raf = 0
  let running = false
  let inView = true
  let lastFrame = 0
  let lastTime = 0
  let lastActivity = -Infinity // last scroll / mouse move / click, for the adaptive frame rate
  let slowAvg = 1 // running average of (time between frames / requested time)
  let frames = 0
  let scrollY = window.scrollY
  let mouseX = 0
  let mouseTarget = 0
  let resizeTimer = 0
  const effects = [] // click effects: { kind: 'shoot' | 'ring', born (ms), ... }
  const shoot = new Float32Array(SHOOT_MAX * 4)
  const shootP = new Float32Array(SHOOT_MAX * 3)
  const ring = new Float32Array(RING_MAX * 4)

  const animated = () => Boolean(renderer) && !reducedMotion

  // While animated the host is fixed to the viewport (see .hero-landscape--fixed) and follows the page by hand:
  // `pin` is how far it rides up with the scroll before its bottom edge meets the viewport, `horizon` the
  // on-screen water line (css px), which keeps rising past that point until it leaves the screen.
  function pageScroll() {
    const vh = window.innerHeight
    const pin = Math.max(0, H - vh)
    const horizon = Math.max(LAYOUT.horizon * H - (1 - MOTION.scrollLag.scene) * scrollY, PAGE.horizonFloor * vh)
    return { pin, horizon }
  }

  // 0 in the hero, 1 once it has scrolled away (smoothstep over PAGE.fadeFrom..fadeTo).
  function pageFade() {
    const t = clamp((scrollY / window.innerHeight - PAGE.fadeFrom) / (PAGE.fadeTo - PAGE.fadeFrom), 0, 1)
    return t * t * (3 - 2 * t)
  }

  // Moves and dims the fixed host; plain CSS, so it is cheap to call on every scroll event.
  function placeHost() {
    if (!animated() || !H) return
    const { pin } = pageScroll()
    const t = pageFade()
    host.style.transform = `translate3d(0, ${-Math.min(scrollY, pin)}px, 0)`
    host.style.opacity = String(1 - (1 - PAGE.opacity) * t)
  }
  if (animated()) host.classList.add('hero-landscape--fixed')

  function build(force = false) {
    const width = host.clientWidth
    const height = host.clientHeight
    if (!width || !height) return
    small = width < 700
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const budget = small ? MAX_PIXELS.mobile : MAX_PIXELS.desktop
    const nextScale = Math.min(dpr, Math.sqrt(budget / (width * height))) * quality
    if (!force && ridge && width === W && height === H && nextScale === scale) return
    W = width
    H = height
    scale = nextScale
    canvas.width = Math.round(W * scale)
    canvas.height = Math.round(H * scale)

    const landscape = clamp((W / H - 0.5) / 0.9, 0, 1)
    ridge = buildRidge({
      width: W * scale,
      viewportHeight: H * scale,
      landscape,
      margin: MARGIN * scale,
    })
    if (renderer) renderer.setRidge(ridge)
    render(lastTime)
  }

  // Fills the shooting-star and ring uniform arrays from the live click effects (unused slots stay off).
  function effectUniforms(now) {
    shootP.fill(0)
    for (let i = 0; i < RING_MAX; i += 1) ring[i * 4 + 2] = -1
    let s = 0
    let r = 0
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const e = effects[i]
      const age = (now - e.born) / 1000 - (e.delay || 0)
      if (age > (e.kind === 'ring' ? RING_SECONDS : e.dur)) {
        effects.splice(i, 1)
      } else if (age < 0) {
        continue // a staggered shooting star that has not started yet
      } else if (e.kind === 'ring' && r < RING_MAX) {
        ring.set([e.x, e.z, age, 0], r * 4)
        r += 1
      } else if (e.kind === 'shoot' && s < SHOOT_MAX) {
        // Flies in toward the click point and is gone as it arrives.
        const u = age / e.dur
        const left = e.dist * (1 - u)
        shoot.set([e.x - e.dx * left, e.y - e.dy * left, e.dx, e.dy], s * 4)
        const fade = Math.min(u / 0.12, 1) * (1 - Math.max(0, (u - 0.55) / 0.45))
        shootP[s * 3] = e.len * Math.min(u * 5, 1)
        shootP[s * 3 + 1] = fade * e.power
        shootP[s * 3 + 2] = e.size
        s += 1
      }
    }
    return { shoot, shootP, ring }
  }

  const themeTarget = () => (document.documentElement.dataset.theme === 'light' ? 1 : 0)

  function sceneParams(now) {
    const t = animated() ? now / 1000 : MOTION.staticTime
    const sy = animated() ? clamp(scrollY, 0, H) : 0
    const { pin, horizon: pageHorizon } = pageScroll()
    const mx = animated() ? mouseX : 0
    const landscape = clamp((W / H - 0.5) / 0.9, 0, 1)
    const sceneH = H * scale
    const horizon = Math.round((animated() ? pageHorizon + Math.min(scrollY, pin) : LAYOUT.horizon * H) * scale)
    const focal = FOCAL * sceneH
    const bottom = Math.max(1, canvas.height - horizon)
    const fx = effectUniforms(now)
    return {
      ...fx,
      starShift: sy * MOTION.scrollLag.sky * scale,
      time: t % 3600,
      light: themeTarget(),
      breath: 1 + SKY.breathe * (0.6 * Math.sin(t * 0.21) + 0.4 * Math.sin(t * 0.53 + 1.3)),
      mirror: 1 - pageFade(),
      full: clamp(scrollY / Math.max(pin, 0.1 * window.innerHeight), 0, 1),
      sceneH,
      horizon,
      focal,
      skyShift: -sy * (MOTION.scrollLag.sky - MOTION.scrollLag.scene) * scale,
      // Lateral camera move: shifts the water by `mouse.water` px at the bottom
      // edge and proportionally less toward the horizon (true perspective).
      camX: (mx * MOTION.mouse.water * scale * WATER.camHeight) / bottom,
      mountainShift: mx * MOTION.mouse.mountain * scale,
      glowX: lerp(SKY.glowX[0], SKY.glowX[1], landscape),
    }
  }

  // Lets the range cover the lower part of a DOM element: clips it to everything above the ridge
  // silhouette of the second-nearest range and the one in front of it, following the same parallax as the canvas.
  let lastParams = null
  function updateOcclusion(p) {
    if (!occlude || !ridge || !p) return
    const hostRect = host.getBoundingClientRect()
    const box = occlude.getBoundingClientRect()
    if (!box.width || !box.height) return
    const dx = hostRect.left - box.left
    const dy = hostRect.top - box.top
    const horizon = p.horizon / scale
    const x0 = (ridge.x0 + p.mountainShift) / scale
    const step = ridge.step / scale
    const floor = box.height * (1 - MAX_HIDDEN)
    const pts = []
    for (let i = 0; i < ridge.n; i += 1) {
      const x = x0 + i * step + dx
      if (x < -step * 2 || x > box.width + step * 2) continue
      let h = 0
      for (let l = OCCLUDE_LAYER; l < ridge.layers.length; l += 1) h = Math.max(h, ridge.layers[l].heights[i])
      const y = Math.min(box.height + 40, Math.max(floor, horizon - h / scale + dy))
      pts.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`)
    }
    if (!pts.length) {
      occlude.style.clipPath = ''
      return
    }
    pts.reverse()
    occlude.style.clipPath = `polygon(-60px -60px, ${box.width + 60}px -60px, ${pts.join(', ')})`
  }

  function render(now) {
    if (!ridge || contextLost) return
    const p = sceneParams(now)
    lastParams = p
    placeHost()
    updateOcclusion(p)
    if (renderer) renderer.draw(p)
    else if (ctx2d) renderStatic2D(ctx2d, { width: W, height: H, scale, ridge, ...p })
  }

  // Target time between drawn frames: smooth while the user is interacting, calmer at rest, and calmer still
  // once the hero has scrolled away (the lake is then only a faint backdrop).
  function frameInterval(now) {
    const active = effects.length > 0 || now - lastActivity < PERF.activeHoldMs
    if (small) return 1000 / 30
    const away = pageFade() > 0.5 // the hero has mostly scrolled out of view
    const fps = away ? (active ? PERF.restFps : PAGE.idleFps) : active ? PERF.activeFps : PERF.restFps
    return 1000 / fps
  }

  function frame(now) {
    if (!running) return
    raf = requestAnimationFrame(frame)
    const interval = frameInterval(now)
    if (now - lastFrame < interval - 2) return
    const dt = now - lastTime
    lastFrame = now
    lastTime = now
    mouseX += (mouseTarget - mouseX) * Math.min(1, (dt / 1000) * 4)
    render(now)
    // If the GPU cannot keep up (frames arriving much later than asked for), trade resolution for smoothness (twice max).
    frames += 1
    slowAvg = slowAvg * 0.97 + Math.min(dt / interval, 4) * 0.03
    if (frames > 120 && slowAvg > 1.45 && quality > 0.6) {
      quality *= 0.8
      frames = 0
      slowAvg = 1
      build(true)
    }
  }

  function start() {
    if (running || !animated() || contextLost || !inView || document.hidden) return
    running = true
    lastTime = performance.now()
    frames = 0
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  const onScroll = () => {
    lastActivity = performance.now()
    scrollY = window.scrollY
    placeHost()
    if (!animated()) updateOcclusion(lastParams)
  }
  const onPointer = (e) => {
    lastActivity = performance.now()
    mouseTarget = (e.clientX / window.innerWidth - 0.5) * 2
  }
  // A click on the sky fires a shooting star; a click on the lake drops a ring in the water.
  const onClick = (e) => {
    lastActivity = performance.now()
    if (!lastParams || !running || e.button > 0) return
    if (scrollY > H * 0.6) return // only the hero reacts; below it the water is just a backdrop
    if (e.target instanceof Element && e.target.closest(CLICK_IGNORE)) return
    const box = host.getBoundingClientRect()
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return
    const x = (e.clientX - box.left) * scale
    const y = (e.clientY - box.top) * scale
    const p = lastParams
    const born = performance.now()
    if (y < p.horizon) {
      // Several shooting stars of different sizes, one after another, all falling in toward the click.
      // One random direction per click (side and slope), shared by all of them with a hair of spread.
      const count = 4 + Math.floor(Math.random() * 3)
      const sign = Math.random() < 0.5 ? 1 : -1
      const baseAngle = 8 + Math.random() * 34
      for (let i = 0; i < count; i += 1) {
        const angle = (baseAngle + (Math.random() - 0.5) * 4) * (Math.PI / 180)
        const big = Math.random()
        effects.push({
          kind: 'shoot',
          born,
          delay: i * 0.22 + Math.random() * 0.5,
          dur: 0.6 + Math.random() * 0.5,
          x: x + (Math.random() - 0.5) * canvas.width * 0.04,
          y: y - p.starShift + (Math.random() - 0.5) * canvas.width * 0.02,
          dx: sign * Math.cos(angle),
          dy: Math.sin(angle),
          dist: canvas.width * (0.14 + Math.random() * 0.22),
          len: canvas.width * (0.03 + big * 0.07),
          size: 0.6 + big * 0.7,
          power: 0.45 + big * 0.55,
        })
      }
    } else {
      const dy = Math.max(y - p.horizon, 4)
      effects.push({
        kind: 'ring',
        born,
        x: ((x - canvas.width / 2) * WATER.camHeight) / dy + p.camX,
        z: (WATER.camHeight * p.focal) / dy,
      })
    }
    if (effects.length > 24) effects.splice(0, effects.length - 24)
  }
  const onTheme = () => {
    if (!renderer || !ridge || contextLost || !running) {
      render(performance.now())
      return
    }
    const now = performance.now()
    // Draw the old theme one last time and keep a copy of it (a WebGL canvas can only be copied in the same task as its draw).
    renderer.draw({ ...sceneParams(now), light: themeTarget() === 1 ? 0 : 1 })
    ghost.width = canvas.width
    ghost.height = canvas.height
    ghost.getContext('2d').drawImage(canvas, 0, 0)
    ghost.style.transition = 'none'
    ghost.style.opacity = '1'
    void ghost.offsetWidth // commit the opaque state, then fade it out
    ghost.style.transition = `opacity ${THEME_FADE}ms ease`
    ghost.style.opacity = '0'
    render(now) // the live canvas now shows the new theme underneath
  }
  window.addEventListener('themechange', onTheme)
  const onVisibility = () => (document.hidden ? stop() : start())
  const onContextLost = (e) => {
    e.preventDefault() // allows the browser to restore it
    contextLost = true
    stop()
    renderer.lost()
  }
  const onContextRestored = () => {
    contextLost = false
    if (!renderer.init()) return
    render(lastTime)
    start()
  }

  // Rebuild immediately the first time, then debounce live resizes.
  const resizeObserver = new ResizeObserver(() => {
    if (!ridge) {
      build()
      return
    }
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(build, 140)
  })
  resizeObserver.observe(host)

  const viewObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    if (inView) start()
    else stop()
  })
  viewObserver.observe(host)

  window.addEventListener('scroll', onScroll, { passive: true })
  if (animated()) {
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('click', onClick)
  }
  document.addEventListener('visibilitychange', onVisibility)
  if (renderer) {
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
  }

  build()
  start()

  return () => {
    stop()
    clearTimeout(resizeTimer)
    resizeObserver.disconnect()
    viewObserver.disconnect()
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('themechange', onTheme)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('click', onClick)
    document.removeEventListener('visibilitychange', onVisibility)
    if (renderer) {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      renderer.dispose()
    }
    if (occlude) occlude.style.clipPath = ''
    canvas.width = 0
    canvas.height = 0
    canvas.remove()
    ghost.remove()
  }
}
