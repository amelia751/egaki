'use client'

/**
 * AngledScreen — WebGL depth-of-field 3D screen via Remotion HtmlInCanvas.
 *
 * Shader-based successor to BasicAngledScreen (angled-screen.tsx). Children
 * DOM is captured per frame with the HTML-in-canvas API (texElementImage2D)
 * and rendered as a 3D-tilted plane in a WebGL2 fragment shader:
 *
 *   screen pixel → ray from CSS-style perspective camera → ray/plane
 *   intersection → plane-local UV → sample DOM texture
 *
 * The intersection distance gives true per-pixel depth, which drives:
 *   - bokeh blur (poisson-disc, radius grows with distance from focus)
 *   - fog toward backgroundColor (like the original Three.js plugin's
 *     scene fog, unframer-private/plugin-angled-screen BokehPass setup)
 *   - film grain (from the plugin's filmGrainShader, u_time-seeded)
 *
 * Prop names match BasicAngledScreen where semantics carry over:
 * perspective/rotateX/rotateY/rotateZ/translateZ are interpreted exactly
 * like the CSS transform version. Depth of field uses the exact Three.js
 * BokehShader algorithm and the plugin's defaults (aperture 0.5,
 * maxblur 0.12, focus at the plane center): blur grows linearly with the
 * signed distance from the focus plane and saturates at maxBlur, sampled
 * with the 41-tap Martins Upitis ring kernel in screen space.
 *
 * Requires Chrome 149+ with chrome://flags/#canvas-draw-element enabled.
 * Falls back to the CSS BasicAngledScreen when unsupported.
 *
 * EXPORT PATH (DOM-composer fallback), hard-won — don't re-debug:
 * When Remotion's nested HTML-in-canvas probe fails (Chromium changes the
 * API shape between builds), web-renderer composes exports/stills with the
 * DOM composer instead of native capture. Three things must line up for the
 * shader output to survive that path:
 *   1. The scaffold wrapper is visibility:hidden, and Chromium creates no
 *      paint records for hidden subtrees — captureElementImage() throws
 *      "missing paint record" and HtmlInCanvas SILENTLY skips onInit/onPaint
 *      (canRetryMissingPaintRecord swallows it). Fix: the egaki render entry
 *      points wrap the composition root in a visibility:visible div
 *      (wrapForWebRenderer in render-client.ts), restoring paint records
 *      while preserving deeper visibility:hidden semantics (e.g.
 *      LayoutTransition's hidden inactive instances). Do NOT force
 *      visibility on this component's canvas — that leaks into preview.
 *   2. remotion's HtmlInCanvas has a scoping bug (present through 4.0.495):
 *      it registers delayRender() on the GLOBAL window scope but the
 *      scaffold's waitForReady() polls its own delayRenderScope — so the
 *      renderer never waits for the nested canvas paint. Fix: this component
 *      registers its own properly-scoped useDelayRender() handle per frame
 *      while isRendering, calls requestPaint(), and releases the handle only
 *      after onPaint has drawn and blitted the frame.
 *   3. The DOM composer cannot read the transferred placeholder canvas, so
 *      every painted GL frame is blitted into a plain 2D mirror canvas that
 *      the composer picks up like any regular canvas.
 *
 * Coordinate mapping notes (hard-won, don't re-derive):
 *   - GL space is y-up, z toward viewer, camera at (0, 0, perspective).
 *   - CSS rotateX(+)/rotateY(+) match standard GL Rx/Ry; CSS rotateZ is
 *     visually clockwise (y-down), so we negate it for GL.
 *   - UNPACK_FLIP_Y_WEBGL=true puts DOM top at v=1, matching y-up plane UVs.
 */

import {
  HtmlInCanvas,
  useCurrentFrame,
  useDelayRender,
  useRemotionEnvironment,
  useVideoConfig,
  type HtmlInCanvasOnInit,
  type HtmlInCanvasOnPaint,
} from 'remotion'
import { useCallback, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTweakpane } from './tweakpane-hook.tsx'
import { compileGlShader, linkGlProgram, parseHexColor } from './shader-renderer.tsx'
import { BasicAngledScreen } from './angled-screen.tsx'

export interface AngledScreenProps {
  children: ReactNode

  // --- 3D transform (same semantics as BasicAngledScreen) ---
  /** CSS perspective distance in px. Smaller = more dramatic. Default 1200. */
  perspective?: number
  /** X-axis rotation in degrees (tilts top/bottom). Default 8. */
  rotateX?: number
  /** Y-axis rotation in degrees (angles left/right). Default -12. */
  rotateY?: number
  /** Z-axis rotation in degrees. Default 0. */
  rotateZ?: number
  /** Shift the plane horizontally in px. Positive = right. Default 0. */
  translateX?: number
  /** Push the plane forward/back in px. Positive = closer/larger. Default 0. */
  translateZ?: number

  // --- Depth of field (Three.js BokehShader model, same as the Framer plugin) ---
  /** Enable depth-based bokeh blur. Default true. */
  bokeh?: boolean
  /** Aperture — bigger values for shallower depth of field. Blur grows
   *  linearly with distance from the focus plane, scaled by this.
   *  Same semantics as Three's BokehPass. Default 0.5 (plugin value). */
  aperture?: number
  /** Max blur in screen-UV units (fraction of frame size), the saturation
   *  cap of the blur. Same as Three's `maxblur`. Default 0.12 (plugin value). */
  maxBlur?: number
  /** Focus distance as a fraction of `perspective`. Default 0 = auto: focus
   *  tracks the nearest visible point of the plane, so the near side stays
   *  sharp and blur ramps progressively toward the far edge only. */
  focus?: number

  // --- Atmosphere (from the original Three.js plugin) ---
  /** Fog toward backgroundColor at the far depth (0-1). Default 0.35. */
  fog?: number
  /** Film grain intensity. Default 0.02. */
  grainIntensity?: number

  /** Background color behind the tilted screen. Default '#000000'. */
  backgroundColor?: string

  // --- Content sizing ---
  /** Width of the inner content wrapper. Default '80%'. */
  width?: string | number
  /** Height of the inner content wrapper. Default 'auto'. */
  height?: string | number

  /** Render normalized depth as grayscale for debugging the DOF ramp. */
  debug?: boolean

  /** Optional inline style on the outer container. */
  style?: CSSProperties
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_uv;
void main() {
  v_uv = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform mat3 u_rot;          // plane local -> world rotation
uniform vec2 u_planeSize;    // logical composition px
uniform float u_perspective; // camera z in px
uniform float u_translateX;  // plane center x in px
uniform float u_translateZ;  // plane center z in px
uniform float u_depthMin;    // nearest corner distance to camera
uniform float u_depthMax;    // farthest corner distance to camera
uniform float u_bokehEnabled;
uniform float u_aperture;   // Three BokehShader aperture (plugin: 0.5)
uniform float u_maxblur;    // Three BokehShader maxblur, screen-UV units (plugin: 0.12)
uniform float u_focusDist;  // focus distance in px along the ray
uniform float u_aspect;     // width / height, for circular bokeh
uniform float u_fog;
uniform float u_grain;
uniform vec4 u_background;
uniform float u_debug;
uniform float u_time;

in vec2 v_uv;
out vec4 fragColor;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// Three.js BokehShader ring kernel (Martins Upitis lens blur):
// 16 taps at radius 1.0, 8 at 0.9, 8 at 0.7, 8 at 0.4, plus center = 41.
const vec2 RING1[16] = vec2[](
  vec2(0.0, 0.4), vec2(0.15, 0.37), vec2(0.29, 0.29), vec2(-0.37, 0.15),
  vec2(0.40, 0.0), vec2(0.37, -0.15), vec2(0.29, -0.29), vec2(-0.15, -0.37),
  vec2(0.0, -0.4), vec2(-0.15, 0.37), vec2(-0.29, 0.29), vec2(0.37, 0.15),
  vec2(-0.4, 0.0), vec2(-0.37, -0.15), vec2(-0.29, -0.29), vec2(0.15, -0.37)
);
const vec2 RING9[8] = vec2[](
  vec2(0.15, 0.37), vec2(-0.37, 0.15), vec2(0.37, -0.15), vec2(-0.15, -0.37),
  vec2(-0.15, 0.37), vec2(0.37, 0.15), vec2(-0.37, -0.15), vec2(0.15, -0.37)
);
const vec2 RING7[8] = vec2[](
  vec2(0.29, 0.29), vec2(0.40, 0.0), vec2(0.29, -0.29), vec2(0.0, -0.4),
  vec2(-0.29, 0.29), vec2(-0.4, 0.0), vec2(-0.29, -0.29), vec2(0.0, 0.4)
);

// Intersect the camera ray through screen uv suv with the tilted plane.
// Returns ray distance t, or -1.0 on miss. Outputs plane uv + edge coverage.
float intersectPlane(vec2 suv, out vec2 uv, out float coverage) {
  vec2 screen = (suv - 0.5) * u_planeSize;
  vec3 C = vec3(0.0, 0.0, u_perspective);
  vec3 dir = normalize(vec3(screen, 0.0) - C);
  vec3 n = u_rot * vec3(0.0, 0.0, 1.0);
  vec3 q0 = vec3(u_translateX, 0.0, u_translateZ);
  float denom = dot(n, dir);
  if (abs(denom) < 1e-6) return -1.0;
  float t = dot(n, q0 - C) / denom;
  if (t <= 0.0) return -1.0;
  vec3 local = transpose(u_rot) * (C + t * dir - q0);
  uv = local.xy / u_planeSize + 0.5;
  vec2 edgePx = (0.5 - abs(uv - 0.5)) * u_planeSize;
  coverage = clamp(min(edgePx.x, edgePx.y) + 0.5, 0.0, 1.0);
  return t;
}

// Full scene color at a screen position: plane composited over background.
// Screen-space sampling like Three's BokehPass (which blurs the rendered
// frame), so blur also softens the plane edges into the background.
vec4 sampleScene(vec2 suv) {
  vec2 uv;
  float coverage;
  float t = intersectPlane(suv, uv, coverage);
  if (t < 0.0 || coverage <= 0.0) return u_background;
  vec4 c = texture(u_tex, uv);
  c = vec4(mix(u_background.rgb, c.rgb, c.a), 1.0);
  return mix(u_background, c, coverage);
}

void main() {
  vec4 bg = u_background;

  vec2 uv;
  float coverage;
  float t = intersectPlane(v_uv, uv, coverage);
  bool hit = t > 0.0 && coverage > 0.0;

  // Normalized depth across the visible plane (0 = near, 1 = far) — used
  // for fog and the debug view.
  float depth01 = hit
    ? clamp((t - u_depthMin) / max(u_depthMax - u_depthMin, 1e-3), 0.0, 1.0)
    : 1.0;

  if (u_debug > 0.5) {
    fragColor = hit ? mix(bg, vec4(vec3(depth01), 1.0), coverage) : bg;
    return;
  }

  // Three.js BokehShader blur factor, made one-sided: only content BEYOND
  // the focus plane blurs (the far side of the tilted screen). The near side
  // stays tack sharp. Background pixels (no hit) count as far away, so the
  // plane silhouette melts softly where it is out of focus.
  float factor = hit ? max(t - u_focusDist, 0.0) / u_perspective : 1.0;
  vec2 dofblur = vec2(clamp(factor * u_aperture, 0.0, u_maxblur)) * u_bokehEnabled;

  vec2 aspectcorrect = vec2(1.0, u_aspect);
  vec2 dofblur9 = dofblur * 0.9;
  vec2 dofblur7 = dofblur * 0.7;
  vec2 dofblur4 = dofblur * 0.4;

  vec4 col = sampleScene(v_uv);
  for (int i = 0; i < 16; i++) {
    col += sampleScene(v_uv + RING1[i] * aspectcorrect * dofblur);
  }
  for (int i = 0; i < 8; i++) {
    col += sampleScene(v_uv + RING9[i] * aspectcorrect * dofblur9);
  }
  for (int i = 0; i < 8; i++) {
    col += sampleScene(v_uv + RING7[i] * aspectcorrect * dofblur7);
  }
  for (int i = 0; i < 8; i++) {
    col += sampleScene(v_uv + RING7[i] * aspectcorrect * dofblur4);
  }
  col /= 41.0;

  // Fog toward background with depth (plugin's THREE.Fog equivalent)
  col.rgb = mix(col.rgb, bg.rgb, u_fog * depth01 * (hit ? 1.0 : 0.0));

  // Film grain (plugin's filmGrainShader)
  col.rgb += (rand(v_uv + fract(u_time)) - 0.5) * u_grain;
  col.a = 1.0;

  fragColor = col;
}
`

interface GlState {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  texture: WebGLTexture
  locs: Record<string, WebGLUniformLocation | null>
  /** The OffscreenCanvas the WebGL context renders into. */
  canvas: OffscreenCanvas
}

/** Chromium's html-in-canvas layout canvas exposes a non-standard
 *  requestPaint() (behind chrome://flags/#canvas-draw-element). */
type LayoutSubtreeCanvas = HTMLCanvasElement & { requestPaint?: () => void }

const UNIFORM_NAMES = [
  'u_tex',
  'u_rot',
  'u_planeSize',
  'u_perspective',
  'u_translateX',
  'u_translateZ',
  'u_depthMin',
  'u_depthMax',
  'u_bokehEnabled',
  'u_aperture',
  'u_maxblur',
  'u_focusDist',
  'u_aspect',
  'u_fog',
  'u_grain',
  'u_background',
  'u_debug',
  'u_time',
] as const

/**
 * Build the CSS-order rotation matrix M = Rx * Ry * Rz(-z) in GL coords
 * (y up, z toward viewer). Returns row-major 3x3 as number[][].
 */
function rotationMatrix(rxDeg: number, ryDeg: number, rzDeg: number): number[][] {
  const rx = (rxDeg * Math.PI) / 180
  const ry = (ryDeg * Math.PI) / 180
  const rz = (-rzDeg * Math.PI) / 180
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  const Rx = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ]
  const Ry = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ]
  const Rz = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ]
  const mul = (a: number[][], b: number[][]) =>
    a.map((row, i) => row.map((_, j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!))
  return mul(mul(Rx, Ry), Rz)
}

export function AngledScreen(props: AngledScreenProps) {
  const frame = useCurrentFrame()
  const { width: compW, height: compH, fps } = useVideoConfig()
  const glRef = useRef<GlState | null>(null)
  // Mirror canvas: the web-renderer's DOM composer (used for exports and SDK
  // screenshots whenever nested HTML-in-canvas capture is unavailable)
  // cannot read the HtmlInCanvas offscreen and paints the raw children
  // instead. Every painted GL frame is blitted into this plain 2D canvas
  // overlaid on top; the DOM composer draws it like any regular canvas.
  // It is always mounted (not only during export) because sdk.screenshot()
  // captures the live tree without ExportContext.
  const mirrorRef = useRef<HTMLCanvasElement | null>(null)
  const mirrorLoggedRef = useRef(false)

  // Export sync: while web-renderer renders (isRendering), hold a scoped
  // delayRender handle per frame and force a paint on the layout canvas.
  // Released in onPaint after the GL frame is blitted to the mirror, so
  // waitForReady() blocks until the shader output for THIS frame exists.
  // Needed because remotion's own "waiting for first paint" delayRender
  // registers on the window scope, which the export scaffold ignores.
  const { isRendering } = useRemotionEnvironment()
  const { delayRender, continueRender } = useDelayRender()
  const continueRenderRef = useRef(continueRender)
  continueRenderRef.current = continueRender
  const layoutCanvasRef = useRef<LayoutSubtreeCanvas | null>(null)
  const pendingPaintHandleRef = useRef<number | null>(null)

  const tp = useTweakpane('AngledScreen', {
    perspective: { value: props.perspective ?? 1200, min: 100, max: 3000, step: 10 },
    rotateX: { value: props.rotateX ?? 8, min: -90, max: 90, step: 0.5 },
    rotateY: { value: props.rotateY ?? -12, min: -90, max: 90, step: 0.5 },
    rotateZ: { value: props.rotateZ ?? 0, min: -180, max: 180, step: 0.5 },
    translateX: { value: props.translateX ?? 0, min: -1000, max: 1000, step: 1 },
    translateZ: { value: props.translateZ ?? 0, min: -500, max: 500, step: 1 },
    bokeh: props.bokeh ?? true,
    aperture: { value: props.aperture ?? 0.5, min: 0, max: 2, step: 0.01 },
    maxBlur: { value: props.maxBlur ?? 0.12, min: 0, max: 0.3, step: 0.005 },
    // 0 = auto: focus tracks the nearest visible point of the plane, so only
    // the far side blurs, progressively. Any other value = fraction of
    // perspective, like Three's focus uniform.
    focus: {
      value: props.focus ?? 0,
      min: 0,
      max: 2,
      step: 0.01,
    },
    fog: { value: props.fog ?? 0.35, min: 0, max: 1, step: 0.01 },
    grainIntensity: { value: props.grainIntensity ?? 0.02, min: 0, max: 0.2, step: 0.005 },
    backgroundColor: props.backgroundColor ?? '#000000',
    debug: props.debug ?? false,
  })

  const { perspective, rotateX, rotateY, rotateZ, translateX, translateZ } = tp
  const { aperture, maxBlur, focus, fog, grainIntensity } = tp
  const { bokeh, debug, backgroundColor } = tp
  const time = frame / fps

  const onInit: HtmlInCanvasOnInit = useCallback(({ canvas }) => {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      // Required so the mirror canvas (export path) can drawImage() the GL
      // buffer after the draw call instead of getting a cleared buffer.
      preserveDrawingBuffer: true,
    })
    if (!gl) {
      throw new Error('[AngledScreen] WebGL2 unavailable')
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    const vs = compileGlShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compileGlShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = linkGlProgram(gl, vs, fs)
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Fullscreen quad: interleaved position + uv, 6 vertices
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,   1, -1, 1, 0,   -1, 1, 0, 1,
      -1,  1, 0, 1,   1, -1, 1, 0,    1, 1, 1, 1,
    ]), gl.STATIC_DRAW)

    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const posLoc = gl.getAttribLocation(program, 'a_position')
    const uvLoc = gl.getAttribLocation(program, 'a_texCoord')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uvLoc)
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8)

    const locs: Record<string, WebGLUniformLocation | null> = {}
    for (const name of UNIFORM_NAMES) {
      locs[name] = gl.getUniformLocation(program, name)
    }

    gl.useProgram(program)
    gl.bindVertexArray(vao)

    glRef.current = { gl, program, texture, locs, canvas }

    return () => {
      gl.deleteProgram(program)
      gl.deleteTexture(texture)
      gl.deleteVertexArray(vao)
      gl.deleteBuffer(buffer)
      glRef.current = null
    }
  }, [])

  const onPaint: HtmlInCanvasOnPaint = useCallback(
    ({ elementImage }) => {
      const state = glRef.current
      if (!state) return
      const { gl, locs } = state

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, state.texture)
      // The HTML-in-canvas API changed shape between Chromium builds:
      //   Chrome 149-151: texElementImage2D(target, level, internalformat, format, type, element)
      //   Chrome 152+:    texElementImage2D(target, internalformat, element)
      //     where internalformat must be sized (RGBA8, SRGB8_ALPHA8, RGBA16F, RGBA32F)
      // Detect via Function.length (3 = new signature).
      if (gl.texElementImage2D.length <= 3) {
        ;(gl.texElementImage2D as any)(gl.TEXTURE_2D, gl.RGBA8, elementImage)
      } else {
        gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elementImage)
      }

      // CPU-side scene setup: rotation matrix + VISIBLE depth statistics.
      // Depth is sampled on a 7x7 grid of rays across the screen and
      // summarized with percentiles. Percentiles are area-weighted, which
      // matters: rays toward the plane's vanishing direction produce huge t
      // values, and using the raw corner min/max would compress the blur
      // ramp so much that most of the image reads sharp. Quantiles keep the
      // ramp perceptually spread across the screen.
      const M = rotationMatrix(rotateX, rotateY, rotateZ)
      const hw = compW / 2
      const hh = compH / 2
      // Plane normal (third column of M)
      const nx = M[0]![2]!
      const ny = M[1]![2]!
      const nz = M[2]![2]!
      const depths: number[] = []
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 7; gx++) {
          // Ray from camera C=(0,0,perspective) through screen point (sx,sy,0)
          const sx = ((gx / 6) * 2 - 1) * hw
          const sy = ((gy / 6) * 2 - 1) * hh
          const len = Math.hypot(sx, sy, perspective)
          const denom = (nx * sx + ny * sy - nz * perspective) / len
          if (Math.abs(denom) < 1e-6) continue
          // t = dot(n, q0 - C) / dot(n, dir), q0 = (translateX,0,translateZ)
          const t = (nx * translateX + nz * (translateZ - perspective)) / denom
          if (t > 0 && Number.isFinite(t)) depths.push(t)
        }
      }
      depths.sort((a, b) => a - b)
      const quantile = (q: number) =>
        depths[Math.min(depths.length - 1, Math.round(q * (depths.length - 1)))] ?? perspective
      const depthMin = depths.length > 0 ? depths[0]! : perspective
      const depthMax = depths.length > 0 ? quantile(0.95) : perspective + 1

      if (locs.u_tex) gl.uniform1i(locs.u_tex, 0)
      if (locs.u_rot) {
        // GLSL mat3 is column-major; M is row-major → transpose on flatten
        // prettier-ignore
        gl.uniformMatrix3fv(locs.u_rot, false, [
          M[0]![0]!, M[1]![0]!, M[2]![0]!,
          M[0]![1]!, M[1]![1]!, M[2]![1]!,
          M[0]![2]!, M[1]![2]!, M[2]![2]!,
        ])
      }
      if (locs.u_planeSize) gl.uniform2f(locs.u_planeSize, compW, compH)
      if (locs.u_perspective) gl.uniform1f(locs.u_perspective, perspective)
      if (locs.u_translateX) gl.uniform1f(locs.u_translateX, translateX)
      if (locs.u_translateZ) gl.uniform1f(locs.u_translateZ, translateZ)
      if (locs.u_depthMin) gl.uniform1f(locs.u_depthMin, depthMin)
      if (locs.u_depthMax) gl.uniform1f(locs.u_depthMax, depthMax)
      // focus=0 (auto): the focus plane sits at the 40th depth percentile,
      // so roughly the near half of the image reads sharp and blur ramps
      // progressively from there toward the far edge. The effective aperture
      // is auto-scaled so blur reaches maxBlur at the 95th percentile
      // regardless of scene scale (aperture prop acts as a multiplier
      // relative to its 0.5 default: higher = saturates earlier).
      const focusDist = focus > 0 ? focus * perspective : quantile(0.4)
      const apertureEff =
        focus > 0
          ? aperture
          : (aperture / 0.5) * ((maxBlur * perspective) / Math.max(depthMax - focusDist, 1))
      if (locs.u_bokehEnabled) gl.uniform1f(locs.u_bokehEnabled, bokeh ? 1 : 0)
      if (locs.u_aperture) gl.uniform1f(locs.u_aperture, apertureEff)
      if (locs.u_maxblur) gl.uniform1f(locs.u_maxblur, maxBlur)
      if (locs.u_focusDist) gl.uniform1f(locs.u_focusDist, focusDist)
      if (locs.u_aspect) gl.uniform1f(locs.u_aspect, compW / compH)
      if (locs.u_fog) gl.uniform1f(locs.u_fog, fog)
      if (locs.u_grain) gl.uniform1f(locs.u_grain, grainIntensity)
      if (locs.u_background) gl.uniform4fv(locs.u_background, parseHexColor(backgroundColor))
      if (locs.u_debug) gl.uniform1f(locs.u_debug, debug ? 1 : 0)
      if (locs.u_time) gl.uniform1f(locs.u_time, time)

      gl.drawArrays(gl.TRIANGLES, 0, 6)

      // Export path: mirror the GL frame into the overlay 2D canvas so the
      // DOM composer (used when nested HTML-in-canvas capture is
      // unavailable) picks up the shader output instead of the raw children.
      const mirror = mirrorRef.current
      if (mirror) {
        if (mirror.width !== state.canvas.width || mirror.height !== state.canvas.height) {
          mirror.width = state.canvas.width
          mirror.height = state.canvas.height
        }
        const ctx2d = mirror.getContext('2d')
        if (ctx2d) {
          ctx2d.drawImage(state.canvas, 0, 0)
          if (!mirrorLoggedRef.current) {
            mirrorLoggedRef.current = true
            console.info(
              '[egaki] AngledScreen: mirror canvas active — GL frames are blitted to a 2D canvas so DOM-composer captures (export/screenshot) include the shader output.',
            )
          }
        }
      }

      // Release the export-sync handle now that this frame's shader output
      // (including the mirror blit) is complete.
      const pending = pendingPaintHandleRef.current
      if (pending !== null) {
        pendingPaintHandleRef.current = null
        continueRenderRef.current(pending)
      }
    },
    [
      compW, compH, perspective, rotateX, rotateY, rotateZ, translateX, translateZ,
      bokeh, aperture, maxBlur, focus, fog, grainIntensity,
      backgroundColor, debug, time,
    ],
  )

  const supported = typeof document !== 'undefined' && HtmlInCanvas.isSupported()

  // Per-frame export sync (see comment on pendingPaintHandleRef). Layout
  // effect so the handle is registered synchronously inside the renderer's
  // flushSync time update, before waitForReady() first checks the scope.
  // Gated on `supported`: the CSS BasicAngledScreen fallback never paints,
  // so registering a handle there would hang the export until timeout.
  // Also gated on computed visibility: instances under visibility:hidden
  // ancestors (LayoutTransition ghosts and inactive timed instances) get no
  // Chromium paint records, so their HtmlInCanvas never fires paint and a
  // registered handle would hang the export. Premounted sections are fine —
  // remotion premount hides via opacity:0, which keeps paint records.
  useLayoutEffect(() => {
    if (!isRendering || !supported) return
    const canvas = layoutCanvasRef.current
    if (!canvas || getComputedStyle(canvas).visibility === 'hidden') return
    const handle = delayRender('AngledScreen: waiting for shader paint')
    pendingPaintHandleRef.current = handle
    layoutCanvasRef.current?.requestPaint?.()
    return () => {
      if (pendingPaintHandleRef.current === handle) {
        pendingPaintHandleRef.current = null
      }
      continueRenderRef.current(handle)
    }
  }, [frame, isRendering, supported, delayRender])
  if (!supported) {
    if (typeof console !== 'undefined' && !(globalThis as any).__egakiAngledScreenFallbackWarned) {
      ;(globalThis as any).__egakiAngledScreenFallbackWarned = true
      console.warn(
        '[egaki] AngledScreen: HTML-in-canvas is not supported in this browser — ' +
          'falling back to the CSS BasicAngledScreen (no true depth-of-field). ' +
          'Use Chrome 149+ and enable chrome://flags/#canvas-draw-element for the WebGL version.',
      )
    }
    return (
      <BasicAngledScreen
        perspective={perspective}
        rotateX={rotateX}
        rotateY={rotateY}
        rotateZ={rotateZ}
        translateZ={translateZ}
        bokeh={bokeh}
        bokehBlur={maxBlur * compW * 0.4}
        bokehOffset={0.5}
        backgroundColor={backgroundColor}
        width={props.width}
        height={props.height}
        debug={debug}
        style={{
          // BasicAngledScreen has no translateX — approximate with a CSS shift
          transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
          ...props.style,
        }}
      >
        {props.children}
      </BasicAngledScreen>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...props.style }}>
      <HtmlInCanvas
        ref={layoutCanvasRef}
        width={compW}
        height={compH}
        pixelDensity={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)}
        onInit={onInit}
        onPaint={onPaint}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: typeof props.width === 'number' ? `${props.width}px` : (props.width ?? '80%'),
              height: typeof props.height === 'number' ? `${props.height}px` : (props.height ?? 'auto'),
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {props.children}
          </div>
        </div>
      </HtmlInCanvas>
      <canvas
        ref={mirrorRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
