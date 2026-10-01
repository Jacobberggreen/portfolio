import { useEffect, useRef } from 'react'
import { createLandscape } from '../landscape/createLandscape.js'

function HeroLandscape({ occludeRef }) {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    // Mounts its own canvas; StrictMode double-mounts stay clean.
    return createLandscape(host, { occlude: occludeRef?.current ?? null })
  }, [occludeRef])

  return <div ref={hostRef} className="hero-landscape" aria-hidden="true" />
}

export default HeroLandscape
