const year = new Date().getFullYear()

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-line" aria-hidden="true" />
        <p className="footer-copy">© {year} Jacob Berggren</p>
        <p className="footer-note">Designed and built by me</p>
        <nav className="footer-links" aria-label="Footer">
          <a href="/assets/CV_Jacob_Berggren.pdf" target="_blank" rel="noopener noreferrer">
            CV
          </a>
          <button
            type="button"
            className="footer-top"
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0 })}
          >
            Top
            <svg viewBox="0 0 18 14" width="18" height="14" fill="none" aria-hidden="true">
              <path
                d="M1 12.5H8A5 5 0 0 0 13 7.5V1.5M9.8 4.3L13 1.1L16.2 4.3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </nav>
      </div>
    </footer>
  )
}

export default Footer
