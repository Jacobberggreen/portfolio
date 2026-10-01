import { useEffect } from 'react'
import initPortfolio from '../app.js'
import initScrollFocus from './scrollFocus.js'
import initPauseOffscreen from './pauseOffscreen.js'
import BackgroundLayers from './components/BackgroundLayers.jsx'
import NavBar from './components/NavBar.jsx'
import ScrollThumb from './components/ScrollThumb.jsx'
import HeroSection from './components/HeroSection.jsx'
import ProjectsSection from './components/ProjectsSection.jsx'
import AboutSection from './components/AboutSection.jsx'
import FocusSection from './components/FocusSection.jsx'
import SkillsSection from './components/SkillsSection.jsx'
import TimelineSection from './components/TimelineSection.jsx'
import ContactSection from './components/ContactSection.jsx'
import Footer from './components/Footer.jsx'

function App() {
  useEffect(() => {
    initPortfolio()
    const stopFocus = initScrollFocus()
    const stopPause = initPauseOffscreen()
    return () => {
      stopFocus?.()
      stopPause()
    }
  }, [])

  return (
    <>
      <BackgroundLayers />
      <NavBar />
      <ScrollThumb />

      <main>
        <HeroSection />
        <ProjectsSection />
        <AboutSection />
        <FocusSection />
        <SkillsSection />
        <TimelineSection />
        <ContactSection />
      </main>

      <Footer />
    </>
  )
}

export default App
