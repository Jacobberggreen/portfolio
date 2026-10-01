// Fades section content in as it scrolls into view and out as it leaves.
// Writes --focus (0-1) and --shift (-1 entering from below … 1 leaving upward) on each target;
// styles.css turns them into opacity and a small drift.

const TARGETS = '.section:not(.hero) .container > :not(.section-head):not(.proj-stage), .section:not(.hero) .proj-row'
const ZONE = 0.3 // fraction of the viewport over which content fades at each edge

const clamp = (v) => Math.min(1, Math.max(0, v))
const smooth = (t) => t * t * (3 - 2 * t)

export default function initScrollFocus() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

  let ticking = false
  const update = () => {
    ticking = false
    const h = window.innerHeight
    document.querySelectorAll(TARGETS).forEach((el) => {
      const { top, bottom } = el.getBoundingClientRect()
      const entering = smooth(clamp((h - top) / (h * ZONE)))
      const leaving = smooth(clamp(bottom / (h * ZONE)))
      el.style.setProperty('--focus', Math.min(entering, leaving).toFixed(3))
      el.style.setProperty('--shift', (leaving < entering ? -(1 - leaving) : 1 - entering).toFixed(3))
    })
  }
  const schedule = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }

  update()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  return () => {
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
}
