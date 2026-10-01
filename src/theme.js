// Colour theme: 'dark' | 'light'. The choice is stored in localStorage; without one the system setting decides.
// The theme lives on <html data-theme="…"> (set early by the inline script in index.html to avoid a flash).
// The page colours are registered CSS properties that transition on :root (styles.css), and the landscape
// blends its own light/dark mix over the same duration, so everything fades to the other theme together.

const KEY = 'theme'

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme) {
  if (theme === getTheme()) return
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* storage can be blocked; the theme still applies for this visit */
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }))
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}
