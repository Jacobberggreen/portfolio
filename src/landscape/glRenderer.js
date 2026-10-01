// Thin WebGL1 wrapper around the scene shader: owns the program, the two
// textures and the full-screen triangle. Returns null when WebGL (with highp
// fragment precision) is unavailable or the shader fails, so the caller can
// fall back to the static 2D render.

import { VERTEX_SHADER, WAVE_COUNT, fragmentShader } from './shader.js'
import { mulberry32 } from './random.js'
import { WATER } from './params.js'

const UNIFORMS = [
  'uRes', 'uFull', 'uMirror', 'uH', 'uHorizon', 'uFocal', 'uTime', 'uBreath', 'uLight', 'uSkyShift', 'uCamX', 'uGlowX',
  'uRidge', 'uWaves', 'uRidgeTex', 'uNoise', 'uShoot', 'uShootP', 'uRing', 'uStarShift',
]

// Smooth, tileable 4-channel value noise (features ~10 texels wide).
function makeNoiseData(size = 256) {
  const rnd = mulberry32(7331)
  const n = size * size
  const out = new Uint8Array(n * 4)
  let a = new Float32Array(n)
  let b = new Float32Array(n)
  const r = 3
  for (let ch = 0; ch < 4; ch += 1) {
    for (let i = 0; i < n; i += 1) a[i] = rnd()
    // Two separable wrap-around box blurs ≈ a soft gaussian.
    for (let pass = 0; pass < 4; pass += 1) {
      const horizontal = pass % 2 === 0
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          let s = 0
          for (let k = -r; k <= r; k += 1) {
            const xx = horizontal ? (x + k + size) % size : x
            const yy = horizontal ? y : (y + k + size) % size
            s += a[yy * size + xx]
          }
          b[y * size + x] = s / (2 * r + 1)
        }
      }
      ;[a, b] = [b, a]
    }
    let mean = 0
    for (let i = 0; i < n; i += 1) mean += a[i]
    mean /= n
    let v = 0
    for (let i = 0; i < n; i += 1) v += (a[i] - mean) ** 2
    const sd = Math.sqrt(v / n)
    for (let i = 0; i < n; i += 1) {
      const z = (a[i] - mean) / (sd * 4.4) + 0.5 // ±2.2σ → 0..1
      out[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(z * 255)))
    }
  }
  return out
}

function waveUniforms() {
  const data = new Float32Array(WAVE_COUNT * 4)
  WATER.waves.forEach(([lambda, deg, amp], i) => {
    const k = (Math.PI * 2) / lambda
    const th = (deg * Math.PI) / 180
    data[i * 4] = k * Math.sin(th)
    data[i * 4 + 1] = k * Math.cos(th)
    data[i * 4 + 2] = Math.sqrt(9.81 * k) * WATER.speed // deep-water dispersion
    data[i * 4 + 3] = WATER.steepness * amp
  })
  return data
}

function compile(gl, type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn('[landscape] shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function createGLRenderer(canvas) {
  let gl = null
  try {
    gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    })
  } catch {
    gl = null
  }
  if (!gl) return null
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
  if (!hp || hp.precision < 16) return null

  const noiseData = makeNoiseData()
  const waves = waveUniforms()
  let res = null
  let ridge = null

  function init() {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader())
    if (!vs || !fs) return false
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return false
    }
    gl.useProgram(program)
    const loc = {}
    UNIFORMS.forEach((name) => {
      loc[name] = gl.getUniformLocation(program, name)
    })

    // One oversized triangle covers the viewport.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const makeTex = (unit, filter, wrap) => {
      const tex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
      return tex
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    const noiseTex = makeTex(1, gl.LINEAR, gl.REPEAT)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData)
    const ridgeTex = makeTex(0, gl.NEAREST, gl.CLAMP_TO_EDGE)

    gl.uniform1i(loc.uRidgeTex, 0)
    gl.uniform1i(loc.uNoise, 1)
    gl.uniform4fv(loc.uWaves, waves)
    res = { program, buffer, noiseTex, ridgeTex, loc }
    if (ridge) uploadRidge()
    return true
  }

  // Heights are packed as 16-bit fixed point (1/64 px): hi/lo bytes of the
  // sharp ridge in RG and of the blurred ridge in BA.
  function uploadRidge() {
    const { layers, n } = ridge
    const rows = layers.length
    const data = new Uint8Array(n * rows * 4)
    const put = (o, v) => {
      const q = Math.max(0, Math.min(65535, Math.round(v * 64)))
      data[o] = q >> 8
      data[o + 1] = q & 255
    }
    layers.forEach(({ heights }, row) => {
      const blurred = row === ridge.mainRow ? ridge.blurred : heights
      for (let i = 0; i < n; i += 1) {
        put((row * n + i) * 4, heights[i])
        put((row * n + i) * 4 + 2, blurred[i])
      }
    })
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, res.ridgeTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }

  function setRidge(next) {
    ridge = next
    if (res) uploadRidge()
  }

  function draw(u) {
    if (!res || gl.isContextLost()) return
    const { loc } = res
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(loc.uRes, canvas.width, canvas.height)
    gl.uniform1f(loc.uFull, u.full)
    gl.uniform1f(loc.uMirror, u.mirror)
    gl.uniform1f(loc.uH, u.sceneH)
    gl.uniform1f(loc.uHorizon, u.horizon)
    gl.uniform1f(loc.uFocal, u.focal)
    gl.uniform1f(loc.uTime, u.time)
    gl.uniform1f(loc.uBreath, u.breath)
    gl.uniform1f(loc.uLight, u.light)
    gl.uniform1f(loc.uSkyShift, u.skyShift)
    gl.uniform1f(loc.uCamX, u.camX)
    gl.uniform1f(loc.uGlowX, u.glowX)
    gl.uniform4f(loc.uRidge, ridge.x0 + u.mountainShift, ridge.step, ridge.n, ridge.peakPx)
    gl.uniform4fv(loc.uShoot, u.shoot)
    gl.uniform3fv(loc.uShootP, u.shootP)
    gl.uniform1f(loc.uStarShift, u.starShift)
    gl.uniform4fv(loc.uRing, u.ring)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // After a context loss every GL object is already gone; just forget them.
  function lost() {
    res = null
  }

  function dispose() {
    if (res && !gl.isContextLost()) {
      gl.deleteTexture(res.noiseTex)
      gl.deleteTexture(res.ridgeTex)
      gl.deleteBuffer(res.buffer)
      gl.deleteProgram(res.program)
    }
    res = null
    // Hand the context back now instead of waiting for GC (StrictMode mounts
    // twice; browsers cap live contexts).
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  return { gl, init, setRidge, draw, lost, dispose }
}
