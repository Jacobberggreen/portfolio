// One full-screen fragment pass draws the whole scene:
//  - sky: analytic charcoal gradient with a wide glow behind the range
//  - mountain: silhouette from a packed 1D height texture, analytically AA'd
//  - water: a world-space wave field seen in perspective. Every pixel builds a
//    facet normal from a handful of travelling waves and reflects the view ray
//    off it into the same sky + mountain. Waves too fine for the pixel grid are
//    faded out and their slope variance blurs the reflection instead, so the
//    far water melts into a smooth haze (no aliasing sparkle) and the mountain
//    reflection is smeared into a dark band rather than a mirror image.

import { LIGHT, MOUNTAINS, SKY, STARS, WATER } from './params.js'

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`)

const v3 = (c) => `vec3(${c.map((x) => f(+x.toFixed(4))).join(', ')})`

export const WAVE_COUNT = WATER.waves.length
export const SHOOT_MAX = 6
export const RING_MAX = 4

export const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export function fragmentShader() {
  const waveCalls = WATER.waves
    .map((w, i) => {
      const long = i < WAVE_COUNT / 2
      const env = ['g', 'b', 'a'][i % 3]
      const src = long ? 'nA' : 'nB'
      const phi = f(+(i * 2.399).toFixed(3))
      return `  wave(uWaves[${i}], ${f(w[3])}, ${src}.${env}, ${long ? 'warpA' : 'warpB'}, ${phi}, X, Z, mpx, mpz, slope, lost);`
    })
    .join('\n')

  // Ranges are painted far to near, each lighter toward its foot (mist).
  const rangeCalls = MOUNTAINS.map((m, i) => {
    const c = LIGHT.mountains[i]
    return `    {
      vec3 r = ridgeAt(px, ${i}.0);
      float cov = clamp(0.5 + (r.x - hy) * inversesqrt(1.0 + r.z * r.z), 0.0, 1.0);
      float foot = clamp((r.x - hy) / (0.4 * uRidge.w), 0.0, 1.0);
      L = mix(L, ${f(m.lum)} * (1.0 + ${f(m.mist)} * foot), cov);
      gStar *= 1.0 - cov;
      if (uLight > 0.001) {
        vec3 col = mix(${v3(c.color)}, LIGHT_HAZE, clamp(${f(c.haze)} + ${f(c.foot)} * smoothstep(0.1, 1.0, foot), 0.0, 1.0));
        gC = mix(gC, col, cov);
      }
    }`
  }).join('\n')

  return `
precision highp float;

uniform vec2 uRes;          // canvas size, device px
uniform float uFull;        // 0 = lake ends in a soft lower edge (hero), 1 = water runs on past the bottom of the screen
uniform float uMirror;      // 1 = the lake reflects sky and mountains (hero), 0 = no reflection (rest of the page)
uniform float uH;           // scene height (device px) all fractions refer to
uniform float uHorizon;     // water line, device px from the top (integer)
uniform float uFocal;       // focal length, device px
uniform float uTime;
uniform float uLight;       // 0 = dark night scene, 1 = light daytime scene, in between while the theme fades
uniform float uBreath;      // slow glow breathing multiplier (~1)
uniform float uSkyShift;    // extra sky parallax, device px
uniform float uCamX;        // lateral camera offset, metres (mouse parallax)
uniform float uGlowX;       // glow centre, fraction of width
uniform vec4 uRidge;        // x0 (px), step (px), samples, peak height (px)
uniform vec4 uWaves[${WAVE_COUNT}];   // kx, kz, omega, slope amplitude
uniform vec4 uShoot[${SHOOT_MAX}];    // shooting stars: head x, head y (sky space, px), direction x, y
uniform vec3 uShootP[${SHOOT_MAX}];   // trail length (px), alpha (0 = unused), width scale
uniform float uStarShift;   // sky-space offset of the stars (px): they follow the sky's own scroll lag
uniform vec4 uRing[${RING_MAX}];      // water rings: world X, world Z, age (s; <0 = unused), 0
uniform sampler2D uRidgeTex;
uniform sampler2D uNoise;

const float CAM_H = ${f(WATER.camHeight)};
const float SHARP = ${f(WATER.sharpness)};
const float BG_L = 0.0275;   // luminance of the page background (#070708): the water dims toward it while turning transparent
float gSink;
const float SINK = 0.1;      // fraction of the water (horizon to canvas bottom) that does the sinking
const float BOW = 0.24;      // the sinking starts this much earlier at the sides, so the lake's lower edge bows down in the middle

float sq(float x) { return x * x; }

// Cool tint weight: follows the horizon glow (sky) and its reflection (water).
float gT;
vec3 gC; // light theme colour of the pixel (the dark theme only uses the luminance L)
const vec3 LIGHT_HAZE = ${v3(LIGHT.haze)};
vec3 gStar; // stars and the shooting star, added on top in the nav-link hover palette (hidden by the ranges)
const vec3 COOL = vec3(${SKY.tint.map((c) => f(+(c / Math.max(...SKY.tint)).toFixed(4))).join(', ')});

float glowW(float x, float hy) {
  float v = max(hy + uSkyShift, 0.0) / uH;
  float xn = x / uRes.x;
  float rise = exp(-sq((v - 0.06) / ${f(SKY.glowRise)}));
  float side = 0.62 + 0.38 * exp(-sq((xn - uGlowX) / ${f(SKY.glowWidth)}));
  return ${f(SKY.tintAmount)} * rise * side;
}

float skyL(float x, float hy) {
  float v = max(hy + uSkyShift, 0.0) / uH;
  float xn = x / uRes.x;
  float rise = exp(-sq((v - 0.06) / ${f(SKY.glowRise)}));
  float side = 0.62 + 0.38 * exp(-sq((xn - uGlowX) / ${f(SKY.glowWidth)}));
  float L = ${f(SKY.top)} + 0.03 * exp(-v / 0.3) + ${f(SKY.glow)} * uBreath * rise * side;
  float e = abs(xn - 0.5) * 2.0;
  return L * (1.0 - 0.3 * e * e * e);
}

// Light theme sky: blue at the zenith, pale toward the horizon, a faint warm haze behind the summit.
vec3 skyC(float x, float hy) {
  float v = max(hy + uSkyShift, 0.0) / uH;
  float xn = x / uRes.x;
  float rise = exp(-sq((v - 0.06) / ${f(SKY.glowRise)}));
  float side = 0.62 + 0.38 * exp(-sq((xn - uGlowX) / ${f(SKY.glowWidth)}));
  vec3 c = mix(${v3(LIGHT.skyLow)}, ${v3(LIGHT.skyTop)}, smoothstep(0.0, 0.5, v));
  return mix(c, ${v3(LIGHT.glow)}, ${f(LIGHT.glowAmount)} * uBreath * rise * side);
}

float hash(vec2 p, float seed) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 17.3) * 43758.5453);
}

// Nav-link hover palette (--nav-stops in styles.css)
const vec3 PAL_A = vec3(0.412, 0.467, 0.6);   // #7383af
const vec3 PAL_B = vec3(0.624, 0.667, 0.784); // #9faac8
const vec3 PAL_C = vec3(0.737, 0.773, 0.839); // #bcc5d6
const vec3 PAL_D = vec3(0.627, 0.608, 0.718); // #a09bb7

// The full --nav-stops gradient of the navbar links (x: 0..1).
vec3 navGrad(float x) {
  x = fract(x);
  vec3 c = vec3(0.486, 0.486, 0.506);
  c = mix(c, vec3(0.451, 0.514, 0.686), clamp((x - 0.00) / 0.14, 0.0, 1.0));
  c = mix(c, vec3(0.624, 0.667, 0.784), clamp((x - 0.14) / 0.14, 0.0, 1.0));
  c = mix(c, vec3(0.737, 0.773, 0.839), clamp((x - 0.28) / 0.10, 0.0, 1.0));
  c = mix(c, vec3(0.635, 0.678, 0.749), clamp((x - 0.38) / 0.12, 0.0, 1.0));
  c = mix(c, vec3(0.627, 0.608, 0.718), clamp((x - 0.50) / 0.14, 0.0, 1.0));
  c = mix(c, vec3(0.490, 0.541, 0.702), clamp((x - 0.64) / 0.16, 0.0, 1.0));
  c = mix(c, vec3(0.486, 0.486, 0.506), clamp((x - 0.80) / 0.20, 0.0, 1.0));
  return c;
}

// The nav palette sits close to grey; at star brightness that vanishes, so push the hue out and keep the peak channel at 1.
vec3 vivid(vec3 c) {
  float l = dot(c, vec3(0.3333));
  c = max(vec3(l) + (c - l) * ${f(STARS.saturation)}, 0.0);
  return c / max(max(c.r, c.g), c.b);
}

vec3 palette(float a, float b) {
  return vivid(mix(mix(PAL_A, PAL_B, a), mix(PAL_C, PAL_D, a), b));
}

// Sparse, faint twinkling stars on a jittered grid that moves with the sky.
vec3 starsL(float px, float ys, float hy) {
  float cell = uH * ${f(STARS.cell)};
  vec2 g = vec2(px, ys) / cell;
  vec2 id = floor(g);
  vec2 fr = fract(g);
  float present = step(1.0 - ${f(STARS.density)}, hash(id, 1.0));
  vec2 pos = 0.2 + 0.6 * vec2(hash(id, 2.0), hash(id, 3.0));
  float r = max(uH * ${f(STARS.size)}, 0.75);
  vec2 dv = (fr - pos) * cell;
  float core = exp(-dot(dv, dv) / (r * r));
  float mag = 0.35 + 0.65 * sq(hash(id, 4.0));
  float tw = 0.55 + 0.3 * sin(uTime * (0.7 + 1.5 * hash(id, 5.0)) + 6.283 * hash(id, 6.0))
                  + 0.15 * sin(uTime * 2.9 + 6.283 * hash(id, 7.0));
  float v = max(hy + uSkyShift, 0.0) / uH;
  vec3 col = vivid(navGrad(hash(id, 8.0) + uTime * 0.03));
  return col * (present * core * mag * tw * ${f(STARS.gain)} * smoothstep(0.04, 0.3, v));
}

vec3 shootL(float px, float ys) {
  vec3 L = vec3(0.0);
  for (int i = 0; i < ${SHOOT_MAX}; i++) {
    vec3 a = uShootP[i];
    if (a.y > 0.0) {
      vec4 s = uShoot[i];
      vec2 p = vec2(px, ys) - s.xy;
      float along = -dot(p, s.zw);
      float perp = length(p - s.zw * dot(p, s.zw));
      float t = clamp(along / a.x, 0.0, 1.0);
      float w = (uH * 0.0011 * (1.0 - 0.7 * t) + 0.6) * a.z;
      float body = exp(-sq(perp / w)) * step(0.0, along) * step(along, a.x) * sq(1.0 - t);
      float head = exp(-dot(p, p) / (9.0 * w * w));
      L += vivid(navGrad(0.38 - t * 0.4 + 0.06 * sin(uTime * 3.0))) * (a.y * ${f(STARS.shootGain)} * (body + 0.8 * head));
    }
  }
  return L;
}

float mountainL(float hy) {
  return ${f(SKY.mountain)} + ${f(SKY.mountainHaze)} * exp(-max(hy, 0.0) / (0.025 * uH));
}

float unpack(vec2 hl) {
  vec2 b = floor(hl * 255.0 + 0.5);
  return (b.x * 256.0 + b.y) / 64.0;
}

// Returns (sharp height, blurred height, slope of the sharp ridge).
vec3 ridgeAt(float x, float row) {
  float fi = (x - uRidge.x) / uRidge.y;
  float i0 = clamp(floor(fi), 0.0, uRidge.z - 2.0);
  float t = clamp(fi - i0, 0.0, 1.0);
  vec4 a = texture2D(uRidgeTex, vec2((i0 + 0.5) / uRidge.z, (row + 0.5) / ${MOUNTAINS.length}.0));
  vec4 b = texture2D(uRidgeTex, vec2((i0 + 1.5) / uRidge.z, (row + 0.5) / ${MOUNTAINS.length}.0));
  float ha = unpack(a.rg);
  float hb = unpack(b.rg);
  return vec3(mix(ha, hb, t), mix(unpack(a.ba), unpack(b.ba), t), (hb - ha) / uRidge.y);
}

// Slope of one travelling wave with a peaked crest profile
// h ~ exp(q (cos ph - 1)): troughs stay glassy and the crests turn into thin
// lines (large q) or soft rounded swells (small q).
void wave(vec4 w, float q, float envN, float warp, float phi, float X, float Z, float mpx, float mpz,
          inout vec2 slope, inout float lost) {
  // Phase change per pixel: fade waves before they alias.
  float dp = abs(w.x) * mpx + abs(w.y) * mpz;
  float lod = 1.0 - smoothstep(0.45 * SHARP, 1.35 * SHARP, dp);
  float env = 0.3 + 0.7 * smoothstep(0.25, 0.75, envN);
  float a = w.w * env;
  float ph = w.x * X + w.y * Z + w.z * uTime + warp + phi;
  vec2 dir = w.xy * inversesqrt(dot(w.xy, w.xy));
  float c = cos(ph);
  float profile = -sin(ph) * q * exp(q * (c - 1.0)) / (0.35 * q + 0.65);
  slope += dir * (a * lod * profile);
  lost += 0.3 * a * a * (1.0 - lod * lod);
}

float water(float px, float dy) {
  float fl = uFocal;
  float cx = uRes.x * 0.5;
  vec3 d = normalize(vec3((px - cx) / fl, -dy / fl, 1.0));
  float Z = CAM_H * fl / dy;
  float X = (px - cx) * CAM_H / dy + uCamX;
  float mpz = Z / dy;  // metres per pixel, vertically
  float mpx = Z / fl;  // metres per pixel, horizontally
  float t = uTime;

  // Slowly drifting low-frequency fields: patches where ripples live, and the
  // waviness of the crests. Both travel toward the viewer.
  vec4 nA = texture2D(uNoise, vec2(X * 0.003 + t * 0.0021, Z * 0.016 - t * 0.0105));
  vec4 nB = texture2D(uNoise, vec2(X * 0.008 - t * 0.0037, Z * 0.045 - t * 0.024) + 0.37);
  float warpA = (nA.r - 0.5) * 3.0;
  float warpB = (nB.r - 0.5) * 3.0;

  vec2 slope = vec2(0.0);
  float lost = 0.0;
${waveCalls}

  // Close to the camera the same slope lights up far more of the surface, so rings there are toned down.
  float ringTame = mix(1.0, 0.1, smoothstep(0.1, 0.6, dy / uH));
  // Click rings: a short packet of circular waves spreading from the click point, fading as it grows.
  for (int i = 0; i < ${RING_MAX}; i++) {
    vec4 rg = uRing[i];
    if (rg.z >= 0.0) {
      vec2 dv = vec2(X - rg.x, Z - rg.y);
      float d = length(dv) + 0.0001;
      float u = d - (0.15 + rg.z * 1.0);
      float k = 6.0;
      float dp = k * (abs(dv.x / d) * mpx + abs(dv.y / d) * mpz);
      float lodR = 1.0 - smoothstep(0.45 * SHARP, 1.35 * SHARP, dp);
      float amp = 0.75 * exp(-rg.z * 0.8) * smoothstep(0.0, 0.08, rg.z) * inversesqrt(1.0 + d) * ringTame;
      slope += (dv / d) * (-amp * sin(k * u) * exp(-sq(u / 0.9)) * lodR);
    }
  }

  // The far water is calmer: ripples grow in over the first stretch, but keep some motion.
  float calm = ${f(WATER.calm[2])} + ${f(1 - WATER.calm[2])} * smoothstep(${f(WATER.calm[0])}, ${f(WATER.calm[1])}, dy / uH);
  // Last stretch of the water: ripples flatten out as the lake sinks into the page background.
  float side = abs(px / uRes.x - 0.5) * 2.0;
  float sink = 0.0; // the lake no longer fades into the page; it stays opaque to the bottom edge
  gSink = sink;
  slope *= calm * (1.0 - sink);
  lost *= calm * calm * (1.0 - sink);

  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 r = reflect(d, n);
  r.z = max(r.z, 0.2);
  float hyR = fl * max(r.y, 0.0015) / r.z;
  float xR = cx + fl * r.x / r.z;

  // Reflection blurred by the unresolved roughness.
  // Far away the unresolved chop smears the mountain into a soft dark band;
  // up close the resolved facets keep reflections crisp.
  float blurNear = min(fl * 0.8 * sqrt(lost), 0.4 * uRidge.w) + 0.1 * uRidge.w;
  float blur = mix(0.4 * uRidge.w, blurNear, calm);
  float rh = 0.72 * uRidge.w; // mean range height: keeps the reflection symmetric about the centre
  float cov = clamp(0.5 + (rh - hyR) / (2.0 * blur), 0.0, 1.0);
  float refl = mix(skyL(xR, hyR), mountainL(hyR), cov);
  gT = ${f(SKY.tintWater)} * glowW(xR, hyR) * (1.0 - cov) * uMirror;

  float cosT = clamp(dot(-d, n), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  float y = dy / uH;
  float L = ${f(WATER.reflect)} * fres * refl * uMirror;
  L += ${f(WATER.base)} * exp(-y / 0.12);
  L += ${f(WATER.mist)} * uBreath * exp(-y / 0.012);
  L += ${f(WATER.near)} * smoothstep(0.2, 0.75, y) * mix(0.45, 0.45 + 5.0 * length(slope), uMirror);
  // Near the horizon the real waves are too fine to resolve and melt away, so soft horizontal
  // streaks (thinner toward the horizon, drifting slowly) keep the water rippled there too, just quietly.
  float v = log(y + 0.012) * 2.6;
  float sA = texture2D(uNoise, vec2(px / uRes.x * 0.5 + t * 0.004, v - t * 0.012)).g;
  float sB = texture2D(uNoise, vec2(px / uRes.x * 1.3 - t * 0.006, v * 1.9 + t * 0.008) + 0.61).b;
  float streak = (sA - 0.5) + 0.6 * (sB - 0.5);
  L *= 1.0 + 1.1 * streak * (1.0 - smoothstep(0.0, 0.16, y)) * uMirror;
  L *= 1.0 - smoothstep(0.1, ${f(WATER.fade)}, y) * (1.0 - 0.6 * uFull);
  float e = abs(px / uRes.x - 0.5) * 2.0;
  float Lw = mix(L * (1.0 - 0.45 * e * e), BG_L, sink);
  if (uLight > 0.001) {
    // Water by the horizon is pale, nearer it turns deep blue-green; lit ripples pick up the reflected sky and range.
    vec3 body = mix(${v3(LIGHT.waterDeep)}, ${v3(LIGHT.waterFar)}, exp(-y / 0.35));
    vec3 refC = mix(skyC(xR, hyR), mix(${v3(LIGHT.mountains[2].color)}, LIGHT_HAZE, 0.35), cov);
    gC = mix(body, refC, clamp(Lw / ${f(LIGHT.waterLight)}, 0.0, 1.0) * ${f(LIGHT.waterReflect)});
  }
  return Lw;
}

void main() {
  float px = gl_FragCoord.x;
  float py = uRes.y - gl_FragCoord.y;
  float L;
  gSink = 0.0;
  gStar = vec3(0.0);
  gC = vec3(0.0);
  if (py < uHorizon) {
    float hy = uHorizon - py;
    L = skyL(px, hy);
    float ys = py - uStarShift;
    // Stars are invisible in the light theme, so skip their cost there.
    if (uLight < 0.999) gStar = starsL(px, ys, hy) + shootL(px, ys);
    gT = glowW(px, hy);
    gC = skyC(px, hy);
    gStar *= 1.0 - uLight;
${rangeCalls}
  } else {
    L = water(px, py - uHorizon);
  }
  // Static sub-LSB dither against banding in the long dark gradients.
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 c = vec3(L) * mix(vec3(0.99, 1.0, 0.99), COOL, clamp(gT, 0.0, 2.5)) + gStar;
  if (uLight > 0.5) c = gC;
  c += (dither - 0.5) / 255.0;
  // The lake's lower edge fades to fully transparent, so the page shows through (premultiplied alpha).
  float a = 1.0 - gSink;
  gl_FragColor = vec4(c * a, a);
}
`
}
