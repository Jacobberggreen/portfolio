// Every art-direction knob for the hero landscape lives here.
// Luminance values are display values in 0..1 (0.1 ≈ 26/255), measured from
// the reference photo; the scene is monochrome on purpose.

export const LAYOUT = {
  horizon: 0.52, // water line as a fraction of the hero height (hero = 112svh)
  peakU: 0.5, // main summit, fraction of the width from the left
  peakHeight: [0.13, 0.19], // summit height / viewport height (portrait, landscape)
  span: [0.95, 1.0], // how much of the ridge profile fits the width (portrait, landscape)
}

export const SKY = {
  top: 0.15, // zenith charcoal
  glow: 0.2, // extra brightness of the horizon glow at its centre
  glowX: [0.5, 0.5], // glow centre across the width (portrait, landscape)
  glowWidth: 0.55, // horizontal falloff of the glow (fraction of width)
  glowRise: 0.3, // vertical extent of the glow (fraction of viewport height)
  breathe: 0.06, // slow breathing of the glow (relative)
  tint: [185, 196, 217], // cool colour (#b9c4d9) the glow and its reflection lean toward
  tintAmount: 0.75, // how strongly (1 = the glow centre takes the full tint ratio)
  tintWater: 1.75, // extra tint in the reflection (it is dim, so the ratio has to be pushed harder to show)
  mountain: 0.09,
  mountainHaze: 0.02, // extra haze at the mountain foot
}

// Mountain ranges from the farthest to the nearest (index 2 is the main range,
// the one with the summit). lum = luminance at the crest; mist = how much
// lighter the range gets with depth below its crest (haze between the ranges). Shapes live in ridge.js.
export const MOUNTAINS = [
  { lum: 0.19, mist: 0.4 },
  { lum: 0.165, mist: 0.36 },
  { lum: 0.13, mist: 0.17 },
  { lum: 0.095, mist: 0.22 },
  { lum: 0.065, mist: 0.06 },
]

export const WATER = {
  speed: 0.5, // time scale of the wave field (1 = real deep-water dispersion)
  camHeight: 2.4, // metres above the water; larger = fatter bands far away
  steepness: 0.15, // wave slope: more = stronger glints and contrast
  reflect: 0.75, // overall reflectance multiplier (exposure of the water)
  near: 0.065, // extra light caught by the water closest to the camera
  base: 0.03, // light scattered in the water itself
  mist: 0.008, // luminous mist right under the horizon
  fade: 1.15, // distance below the horizon (viewport heights) where it reaches black
  calm: [0.03, 0.17, 0.4], // far water: ripples fade in between these distances (viewport heights below the horizon); the 3rd value is how much motion survives right at the horizon (0 = glass)
  sharpness: 0.75, // anti-alias threshold for fine ripples (higher = more hairlines, more shimmer)
  // [wavelength m, direction deg (0 = straight toward the viewer), relative
  //  amplitude, crest sharpness (high = thin hairline crests, low = soft swells)]
  waves: [
    [8, -3, 0.9, 3.2],
    [4.4, 4, 1, 3],
    [2.4, -6, 1, 2.6],
    [1.35, 8, 1, 2.2],
    [0.78, -4, 0.9, 1.6],
    [0.45, 10, 0.75, 1.2],
  ],
}

export const MOTION = {
  scrollLag: { scene: 0.22, sky: 0.3 }, // share of the scroll offset each layer lags behind
  mouse: { mountain: 3, water: 9 }, // max horizontal shift in css px (water: at the bottom edge)
  staticTime: 14, // time (s) shown when motion is reduced or WebGL is missing
}

// Faint twinkling stars and the shooting star fired by a click on the sky.
export const STARS = {
  cell: 0.055, // grid cell size (scene heights); one candidate star per cell
  density: 0.28, // share of cells that hold a star
  size: 0.0011, // star radius (scene heights)
  gain: 0.4, // peak added luminance (sky is ~0.07-0.19, so this stays quiet)
  saturation: 4, // pushes the nav palette's hue out so it survives the low brightness (1 = as in the navbar)
  shootGain: 0.22, // brightness of the shooting star
}

// The lake stays fixed behind the whole page: the scene scrolls away with the hero until the canvas is pinned
// to the viewport, then keeps rising until the horizon has left the screen and only water is left.
export const PAGE = {
  opacity: 0.3, // how visible the landscape is below the hero (1 = as in the hero)
  fadeFrom: 0.25, // scroll distance (viewport heights) where it starts dimming
  fadeTo: 1, // ... and where it reaches PAGE.opacity
  horizonFloor: -0.1, // lowest on-screen horizon position (viewport heights, negative = above the screen)
  idleFps: 15, // frame rate once the hero is scrolled out of view (the lake is only a faint backdrop there, and every frame also forces the blurred glass cards on top of it to be redrawn)
}

// Light theme: a quiet neutral scene (Radix "sand" greys with a whisper of warmth), so the saturated
// accents of the UI (see styles.css) stand out against it. Colours are sRGB 0..1.
export const LIGHT = {
  skyTop: [0.86, 0.85, 0.83], // warm light grey at the zenith
  skyLow: [0.95, 0.93, 0.9], // pale sand by the horizon
  glow: [1.0, 0.94, 0.84], // faint warm light behind the summit
  glowAmount: 0.5,
  haze: [0.9, 0.88, 0.85], // mist between the ranges
  // Far to near, same order as MOUNTAINS: the colour at the crest, how misty the whole range is,
  // and how much extra mist gathers at its foot.
  mountains: [
    { color: [0.78, 0.76, 0.74], haze: 0.3, foot: 0.5 },
    { color: [0.68, 0.66, 0.64], haze: 0.22, foot: 0.5 },
    { color: [0.56, 0.54, 0.53], haze: 0.14, foot: 0.5 },
    { color: [0.44, 0.42, 0.42], haze: 0.06, foot: 0.4 },
    { color: [0.31, 0.29, 0.29], haze: 0.0, foot: 0.3 },
  ],
  waterDeep: [0.4, 0.42, 0.48], // water close to the viewer
  waterFar: [0.8, 0.79, 0.77], // water by the horizon
  waterReflect: 0.7, // how strongly lit ripples take the reflected sky/range colour (0..1)
  waterLight: 0.2, // dark-theme water luminance that counts as fully lit
}

// Rendering cost. The lake is a full-screen fragment shader, so frame rate and pixel count are what the GPU pays for.
// The frame rate adapts: the calm lake at rest does not need 60 fps, but anything that follows the user's hand
// (scrolling, moving the mouse, clicking and the ripples/shooting stars that follow) looks best when smooth.
export const PERF = {
  restFps: 30, // desktop, nothing going on
  activeFps: 60, // desktop, while scrolling / moving the mouse / click effects are alive
  activeHoldMs: 1500, // how long after the last scroll, mouse move or click it keeps the active rate
  desktopPixels: 2.0e6, // internal resolution budget (the water is soft, so it upscales cleanly; retina would otherwise be ~3.6e6)
}
