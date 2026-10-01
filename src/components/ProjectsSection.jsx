import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { categories, projects, featuredOrder } from '../data/projects.js'

const byId = Object.fromEntries(projects.map((p) => [p.id, p]))
const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]))

const featuredSeq = featuredOrder.map((id) => ({ type: 'project', key: id, project: byId[id] }))
const featuredCards = featuredSeq.slice(0, 2)

// Every category's projects followed by a "next up" interstitial, so the arrows can walk the lot.
const categorySeq = categories.flatMap((cat, i) => [
  ...projects
    .filter((p) => p.category === cat.id)
    .map((p) => ({ type: 'project', key: p.id, project: p })),
  { type: 'next', key: `next-${cat.id}`, from: cat, to: categories[(i + 1) % categories.length] },
])

gsap.registerPlugin(ScrollToPlugin)

const EXPAND = 0.75
const COLLAPSE = 0.55
const EASE = 'power3.inOut'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isMobile = () => window.matchMedia('(max-width: 720px)').matches

function rectWithin(el, panel) {
  const base =
    getComputedStyle(panel).position === 'fixed'
      ? { left: 0, top: 0 }
      : panel.offsetParent.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height }
}

// Brings the stage to the middle of the screen while the panel expands (the panel rides along with it).
function centerStage(stage) {
  if (isMobile()) return // the panel is full screen there
  const { top, height } = stage.getBoundingClientRect()
  const offset = Math.max(16, (window.innerHeight - height) / 2)
  const delta = top - offset
  if (Math.abs(delta) < 8) return
  // The page has `scroll-behavior: smooth`, which would make every per-frame scrollTo start its own glide.
  const root = document.documentElement
  const restore = () => { root.style.scrollBehavior = '' }
  root.style.scrollBehavior = 'auto'
  gsap.to(window, {
    scrollTo: { y: window.scrollY + delta, autoKill: true },
    duration: reduceMotion() ? 0 : EXPAND,
    ease: EASE,
    onComplete: restore,
    onInterrupt: restore,
  })
}

// Which card the panel collapses back into: the one matching how it was opened and what is showing now.
// Cards tip away from the pointer near their edges, as if the cursor had weight. Flat in the middle.
const tiltTo = (el, vars) =>
  gsap.to(el, { transformPerspective: 900, duration: 1.1, ease: 'power2.out', overwrite: 'auto', ...vars })
const edge = (v) => Math.sign(v) * Math.abs(v) ** 3

function tiltHandlers(max) {
  const enabled = (e) => e.pointerType === 'mouse' && !reduceMotion()
  return {
    onPointerMove: (e) => {
      if (!enabled(e)) return
      const r = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = ((e.clientY - r.top) / r.height) * 2 - 1
      tiltTo(e.currentTarget, { rotationX: -edge(y) * max, rotationY: edge(x) * max, y: -2 })
    },
    onPointerLeave: (e) => tiltTo(e.currentTarget, { rotationX: 0, rotationY: 0, y: 0, duration: 1.2, ease: 'power3.out' }),
  }
}

function cardKeyFor(item, mode) {
  if (item.type === 'next') return `cat:${item.from.id}`
  if (mode === 'category') return `cat:${item.project.category}`
  const featured = featuredCards.some((c) => c.key === item.project.id)
  return featured ? `feat:${item.project.id}` : `cat:${item.project.category}`
}

function Art({ project }) {
  if (project.image) return <img className="proj-art" src={project.image} alt="" />
  return <div className="proj-art proj-art--placeholder" data-art={project.art ?? 0} aria-hidden="true" />
}

function ProjectsSection() {
  const [open, setOpen] = useState(null) // { mode: 'featured' | 'category', index }
  const [originKey, setOriginKey] = useState(null)
  const [dir, setDir] = useState(1)
  const [closing, setClosing] = useState(false)
  const cardRefs = useRef({})
  const panelRef = useRef(null)
  const busyRef = useRef(false)
  const isOpen = open !== null

  const seq = open?.mode === 'featured' ? featuredSeq : categorySeq
  const item = open ? seq[open.index] : null

  const openAt = (mode, index, key) => {
    if (busyRef.current || isOpen) return
    busyRef.current = true
    gsap.killTweensOf(cardRefs.current[key])
    gsap.set(cardRefs.current[key], { rotationX: 0, rotationY: 0, y: 0 })
    setOriginKey(key)
    setDir(1)
    setOpen({ mode, index })
  }

  useLayoutEffect(() => {
    if (!isOpen) return
    const panel = panelRef.current
    const origin = cardRefs.current[originKey]
    const body = panel.querySelector('.proj-panel__inner')
    const done = () => {
      busyRef.current = false
      panel.focus({ preventScroll: true })
    }
    if (!origin || reduceMotion()) {
      gsap.fromTo(body, { opacity: 0 }, { opacity: 1, duration: reduceMotion() ? 0 : 0.4, onComplete: done })
      return
    }
    const from = rectWithin(origin, panel)
    centerStage(panel.parentElement)
    gsap.fromTo(
      panel,
      { top: from.top, left: from.left, width: from.width, height: from.height },
      {
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        duration: EXPAND,
        ease: EASE,
        clearProps: 'top,left,width,height',
        onComplete: done,
      },
    )
    gsap.fromTo(body, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, delay: EXPAND * 0.45, ease: 'power2.out' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const close = useCallback(() => {
    const panel = panelRef.current
    if (!panel || busyRef.current) return
    busyRef.current = true
    const key = cardKeyFor(item, open.mode)
    setClosing(true)
    const target = cardRefs.current[key]
    const finish = () => {
      setOpen(null)
      setOriginKey(null)
      setClosing(false)
      busyRef.current = false
      target?.focus({ preventScroll: true })
    }
    setOriginKey(key)
    if (!target || reduceMotion()) return finish()
    const to = rectWithin(target, panel)
    const current = rectWithin(panel, panel)
    gsap.to([panel.querySelector('.proj-panel__inner'), ...document.querySelectorAll('.proj-nav')], { opacity: 0, duration: 0.2 })
    gsap.fromTo(
      panel,
      { top: current.top, left: current.left, width: current.width, height: current.height },
      { top: to.top, left: to.left, width: to.width, height: to.height, duration: COLLAPSE, ease: EASE, onComplete: finish },
    )
  }, [item, open])

  const go = useCallback(
    (delta) => {
      if (busyRef.current) return
      setDir(delta)
      setOpen((o) => {
        const len = (o.mode === 'featured' ? featuredSeq : categorySeq).length
        return { ...o, index: (o.index + delta + len) % len }
      })
    },
    [],
  )

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close, go])

  // The panel goes full screen on phones, so the page behind must not scroll.
  useEffect(() => {
    if (!isOpen || !isMobile()) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  const setCardRef = (key) => (el) => {
    cardRefs.current[key] = el
  }

  const label = (() => {
    if (!open) return ''
    if (item.type === 'next') return 'Up next'
    if (open.mode === 'featured') return `Featured · ${open.index + 1} / ${featuredSeq.length}`
    const inCat = categorySeq.filter((s) => s.type === 'project' && s.project.category === item.project.category)
    return `${categoryById[item.project.category].name} · ${inCat.indexOf(item) + 1} / ${inCat.length}`
  })()

  return (
    <section id="projects" className="section projects section--work">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Work</p>
          <h2>Selected projects</h2>
        </div>

        <div className={`proj-stage${isOpen && !closing ? ' is-dim' : ''}${closing ? ' is-closing' : ''}`}>
          <div className="proj-row proj-row--featured">
            {featuredCards.map((c, i) => {
              const key = `feat:${c.key}`
              return (
                <button
                  key={key}
                  type="button"
                  ref={setCardRef(key)}
                  className={`proj-card proj-card--featured${originKey === key ? ' is-origin' : ''}`}
                  onClick={() => openAt('featured', i, key)}
                  {...tiltHandlers(2)}
                >
                  <Art project={c.project} />
                  <span className="proj-card__text">
                    <span className="proj-card__kicker">Featured</span>
                    <span className="proj-card__title">{c.project.title}</span>
                    <span className="proj-card__sub">{c.project.tagline}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="proj-row proj-row--cats" style={{ '--n': categories.length }}>
            {categories.map((cat) => {
              const key = `cat:${cat.id}`
              const count = projects.filter((p) => p.category === cat.id).length
              const start = categorySeq.findIndex((s) => s.type === 'project' && s.project.category === cat.id)
              return (
                <button
                  key={key}
                  type="button"
                  ref={setCardRef(key)}
                  className={`proj-card proj-card--cat${originKey === key ? ' is-origin' : ''}`}
                  onClick={() => openAt('category', start, key)}
                  {...tiltHandlers(3.5)}
                >
                  <span className="proj-card__text">
                    <span className="proj-card__kicker">{count} {count === 1 ? 'project' : 'projects'}</span>
                    <span className="proj-card__title">{cat.name}</span>
                    <span className="proj-card__sub">{cat.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {isOpen && (
            <div
              className="proj-panel"
              ref={panelRef}
              role="dialog"
              aria-label={item.type === 'next' ? `Next: ${item.to.name}` : item.project.title}
              tabIndex={-1}
            >
              <div className="proj-panel__inner">
                <div className="proj-panel__bar">
                  <span className="proj-panel__count">{label}</span>
                  <button type="button" className="proj-btn proj-btn--close" onClick={close} aria-label="Close">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>

                <div className="proj-slide" key={item.key} data-dir={dir > 0 ? 'next' : 'prev'}>
                  {item.type === 'project' ? (
                    <article className="proj-detail">
                      <div className="proj-detail__art"><Art project={item.project} /></div>
                      <div className="proj-detail__copy">
                        <p className="proj-card__kicker">{categoryById[item.project.category].name} · {item.project.year}</p>
                        <h3>{item.project.title}</h3>
                        <p className="proj-detail__lede">{item.project.tagline}</p>
                        <p className="proj-detail__body">{item.project.description}</p>
                        <dl className="proj-detail__meta">
                          <div><dt>Role</dt><dd>{item.project.role}</dd></div>
                          <div><dt>Built with</dt><dd>{item.project.tags.join(' · ')}</dd></div>
                        </dl>
                        {item.project.links.length > 0 && (
                          <p className="proj-detail__links">
                            {item.project.links.map((l) => (
                              <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
                            ))}
                          </p>
                        )}
                      </div>
                    </article>
                  ) : (
                    <div className="proj-next">
                      <p className="proj-card__kicker">That was {item.from.name}</p>
                      <h3>Next up: {item.to.name}</h3>
                      <p className="proj-detail__lede">{item.to.blurb}</p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {isOpen && (
            <>
              <button type="button" className="proj-btn proj-nav proj-btn--prev" onClick={() => go(-1)} aria-label="Previous project">
                <span className="proj-nav__glyph" aria-hidden="true" />
              </button>
              <button type="button" className="proj-btn proj-nav proj-btn--next" onClick={() => go(1)} aria-label="Next project">
                <span className="proj-nav__glyph" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default ProjectsSection
