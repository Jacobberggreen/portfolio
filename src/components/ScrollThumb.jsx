import { useEffect, useRef } from 'react'

const MIN_HEIGHT = 56
const THUMB_W = 40 // px; the drawn line hugs the right edge of this box
const EDGE = 3 // gap between the line and the window edge
const REACH = 150 // px from the line within which the mouse starts to pull on it
const MAX_BULGE = 30 // px the line can stretch toward the mouse
const NAV_PAD = 10 // px around the nav links where the scrollbar stays passive so they are easy to click
const SIGMA = 46 // px; how tall the magnetic bulge is

// Thin custom scrollbar (the native one is hidden in styles.css). The thumb is 2px wide but sits
// in a wider, invisible track so it is easy to grab; click the track to jump, drag to scroll.
function ScrollThumb() {
  const trackRef = useRef(null)
  const thumbRef = useRef(null)

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return undefined

    let frame = 0
    let thumbHeight = 0
    // Magnet: the line bulges toward the mouse in a smooth arc. Values are eased every frame.
    const magnet = { amp: 0, y: 0, ampTarget: 0, yTarget: 0, loop: 0 }
    let mouseX = -1
    let mouseY = -1
    let dragging = false
    let overNav = false
    let startY = 0
    let startScroll = 0

    const metrics = () => {
      const doc = document.documentElement
      const view = window.innerHeight
      return { view, max: doc.scrollHeight - view, total: doc.scrollHeight }
    }

    const isOverNav = (x, y) => {
      const nav = document.querySelector('.nav-links')
      if (!nav) return false
      const r = nav.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      return x >= r.left - NAV_PAD && x <= r.right + NAV_PAD && y >= r.top - NAV_PAD && y <= r.bottom + NAV_PAD
    }

    // Redraws the line as a clip-path: straight on the right, arcing out to the left around the mouse.
    const render = () => {
      if (thumbHeight <= 0) return
      const xr = THUMB_W - EDGE
      const t = 2 + 2 * Math.min(magnet.amp / MAX_BULGE, 1)
      const n = Math.max(12, Math.ceil(thumbHeight / 8))
      const left = []
      const right = []
      for (let i = 0; i <= n; i += 1) {
        const y = (thumbHeight * i) / n
        const dy = (y - magnet.y) / SIGMA
        const x = xr - t - magnet.amp * Math.exp(-dy * dy)
        left.push(`${x.toFixed(2)}px ${y.toFixed(1)}px`)
        right.unshift(`${xr}px ${y.toFixed(1)}px`)
      }
      thumb.style.clipPath = `polygon(${left.concat(right).join(',')})`
    }

    const pull = () => {
      const { view, max } = metrics()
      if (max <= 0 || thumbHeight <= 0 || mouseX < 0 || (overNav && !dragging)) {
        magnet.ampTarget = 0
        return
      }
      const dist = Math.max(window.innerWidth - EDGE - mouseX, 0)
      const s = dragging ? 1 : Math.max(1 - dist / REACH, 0)
      magnet.ampTarget = MAX_BULGE * s * s
      magnet.yTarget = mouseY - thumb.getBoundingClientRect().top
      if (view <= 0) magnet.ampTarget = 0
    }

    const tick = () => {
      magnet.loop = 0
      pull()
      magnet.amp += (magnet.ampTarget - magnet.amp) * 0.2
      magnet.y += (magnet.yTarget - magnet.y) * 0.3
      render()
      const settled = Math.abs(magnet.ampTarget - magnet.amp) < 0.05 && Math.abs(magnet.yTarget - magnet.y) < 0.5
      if (!settled) magnet.loop = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (!magnet.loop) magnet.loop = requestAnimationFrame(tick)
    }

    // pointermove, not mousemove: the drag's pointerdown calls preventDefault, which suppresses mouse events
    const onMouseMove = (e) => {
      if (e.pointerType !== 'mouse') return
      mouseX = e.clientX
      mouseY = e.clientY
      if (!dragging) {
        overNav = isOverNav(mouseX, mouseY)
        // let clicks fall through the invisible track to the nav links underneath
        track.style.pointerEvents = overNav ? 'none' : ''
      }
      wake()
    }
    const onMouseLeave = () => {
      mouseX = -1
      wake()
    }

    const update = () => {
      frame = 0
      const { view, max, total } = metrics()
      if (max <= 0) {
        thumbHeight = 0
        thumb.style.height = '0px'
        track.style.pointerEvents = 'none'
        return
      }
      track.style.pointerEvents = ''
      thumbHeight = Math.max((view / total) * view, MIN_HEIGHT)
      const progress = Math.min(Math.max(window.scrollY / max, 0), 1)
      thumb.style.height = `${thumbHeight}px`
      thumb.style.transform = `translateY(${progress * (view - thumbHeight)}px)`
      render()
      if (mouseX >= 0) wake()
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const scrollTo = (top) => window.scrollTo({ top, behavior: 'instant' })

    const onPointerDown = (e) => {
      if (e.button !== 0) return
      const { view, max } = metrics()
      if (max <= 0) return
      e.preventDefault()
      const rect = thumb.getBoundingClientRect()
      const onThumb = e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!onThumb) {
        const travel = Math.max(view - thumbHeight, 1)
        const ratio = Math.min(Math.max((e.clientY - thumbHeight / 2) / travel, 0), 1)
        scrollTo(ratio * max)
      }
      dragging = true
      startY = e.clientY
      startScroll = window.scrollY
      track.setPointerCapture(e.pointerId)
      track.classList.add('is-dragging')
      document.documentElement.classList.add('is-scroll-dragging')
    }

    const onPointerMove = (e) => {
      if (!dragging) return
      const { view, max } = metrics()
      const travel = Math.max(view - thumbHeight, 1)
      scrollTo(startScroll + ((e.clientY - startY) * max) / travel)
      wake()
    }

    const endDrag = (e) => {
      if (!dragging) return
      dragging = false
      if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
      track.classList.remove('is-dragging')
      document.documentElement.classList.remove('is-scroll-dragging')
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('pointermove', onMouseMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onMouseLeave)
    track.addEventListener('pointerdown', onPointerDown)
    track.addEventListener('pointermove', onPointerMove)
    track.addEventListener('pointerup', endDrag)
    track.addEventListener('pointercancel', endDrag)
    const resize = new ResizeObserver(schedule)
    resize.observe(document.body)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pointermove', onMouseMove)
      document.documentElement.removeEventListener('mouseleave', onMouseLeave)
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', endDrag)
      track.removeEventListener('pointercancel', endDrag)
      resize.disconnect()
      if (frame) cancelAnimationFrame(frame)
      if (magnet.loop) cancelAnimationFrame(magnet.loop)
      document.documentElement.classList.remove('is-scroll-dragging')
    }
  }, [])

  return (
    <div ref={trackRef} className="scroll-track" aria-hidden="true">
      <div ref={thumbRef} className="scroll-thumb" />
    </div>
  )
}

export default ScrollThumb
