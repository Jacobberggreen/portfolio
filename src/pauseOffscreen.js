// The shimmering gradient text repaints on every animation step, so pause it while it is off screen.
// Adds .anim-paused to the elements below whenever they are outside the viewport (see styles.css).

const SELECTOR = '.hero-wordmark, .eyebrow, .section-head h2, .footer-line'

export default function initPauseOffscreen() {
  if (!('IntersectionObserver' in window)) return () => {}
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('anim-paused', !entry.isIntersecting))
    },
    { rootMargin: '120px' },
  )
  document.querySelectorAll(SELECTOR).forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}
