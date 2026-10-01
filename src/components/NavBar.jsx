import { useEffect, useRef, useState } from 'react'
import { getTheme, toggleTheme } from '../theme.js'

// Each link's text paints the same travelling gradient, offset by the link's position in the
// menu, so one sheen sweeps across all of them instead of every link shimmering on its own.
function useSharedShimmer(headerRef, navRef) {
  useEffect(() => {
    const header = headerRef.current
    const nav = navRef.current
    if (!header || !nav) return undefined

    const measure = () => {
      const navRect = nav.getBoundingClientRect()
      const vertical = header.classList.contains('nav-docked')
      const tile = Math.max(vertical ? navRect.height : navRect.width, 120) * 0.85
      nav.style.setProperty('--nav-tile', `${Math.round(tile)}px`)
      nav.querySelectorAll('a').forEach((link) => {
        const r = link.getBoundingClientRect()
        link.style.setProperty('--ox', `${Math.round(r.left - navRect.left)}px`)
        link.style.setProperty('--oy', `${Math.round(r.top - navRect.top)}px`)
      })
    }

    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(nav)
    const mutation = new MutationObserver(measure)
    mutation.observe(header, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', measure)
    return () => {
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [headerRef, navRef])
}

// Links carry no href so the browser doesn't show its URL preview in the corner; we scroll ourselves.
function goToSection(e) {
  const target = document.querySelector(e.currentTarget.dataset.target)
  if (target) target.scrollIntoView()
}

function activateOnEnter(e) {
  if (e.key === 'Enter') e.currentTarget.click()
}

// The last menu entry switches the colour theme; its label names the mode you would switch to.
function useTheme() {
  const [theme, setTheme] = useState(getTheme)
  useEffect(() => {
    const sync = () => setTheme(getTheme())
    window.addEventListener('themechange', sync)
    return () => window.removeEventListener('themechange', sync)
  }, [])
  return theme
}

function NavBar() {
  const theme = useTheme()
  const headerRef = useRef(null)
  const navRef = useRef(null)
  useSharedShimmer(headerRef, navRef)

  return (
    <header className="navbar" ref={headerRef}>
      <div className="container nav-inner">
        <button
          className="nav-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="primary-nav"
          aria-label="Toggle menu"
        >
          <span className="nav-toggle__icon" aria-hidden="true">
            <span></span>
          </span>
        </button>
        <nav id="primary-nav" className="nav-links" aria-label="Primary" ref={navRef}>
          <a data-target="#hero" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--top">
            <span>Start</span>
          </a>
          <a data-target="#projects" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--work">
            <span>Work</span>
          </a>
          <a data-target="#about" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--about">
            <span>About</span>
          </a>
          <a data-target="#value" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--focus">
            <span>Focus</span>
          </a>
          <a data-target="#skills" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--skills">
            <span>Skills</span>
          </a>
          <a data-target="#timeline" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--journey">
            <span>Journey</span>
          </a>
          <a data-target="#contact" role="link" tabIndex={0} onClick={goToSection} onKeyDown={activateOnEnter} className="nav-link nav-link--contact">
            <span>Contact</span>
          </a>
          <a
            role="button"
            tabIndex={0}
            onClick={toggleTheme}
            onKeyDown={activateOnEnter}
            className="nav-link nav-link--theme"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
          </a>
        </nav>
      </div>
    </header>
  )
}

export default NavBar
