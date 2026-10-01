import HeroLandscape from './HeroLandscape.jsx'

// Each letter is its own element so the hover sheen plays on just the letter under the cursor.
function Letters({ text }) {
  return Array.from(text).map((char, i) => (
    <span className="hero-letter" aria-hidden="true" key={i}>
      {char}
    </span>
  ))
}

function HeroSection() {
  return (
    <section id="hero" className="hero section" aria-label="Jacob Berggren">
      <HeroLandscape />
      <div className="container">
        <h1 className="hero-wordmark" aria-label="Jacob Berggren">
          <span className="hero-wordmark__first" aria-hidden="true">
            <Letters text="Jacob" />
          </span>
          <span className="hero-wordmark__last" aria-hidden="true">
            <Letters text="Berggren" />
          </span>
        </h1>
      </div>
    </section>
  )
}

export default HeroSection
