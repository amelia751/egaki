'use client'

/**
 * LiquidGradientShader — animated liquid turbulence gradient with Oklab color mixing.
 *
 * Port of Framer's LiquidGradient shader module for Remotion/egaki.
 * Original source:
 *   https://framerusercontent.com/modules/QEytd7xyjUsL7yuVUzSs/O7s2vxltmhiskELYwyrY/LiquidGradient.js
 *
 * A multi-color gradient is warped through seed-dependent turbulence with
 * configurable amplitude, frequency, and iteration count. Colors are mixed
 * in Oklab/LCH perceptual color space for smooth, natural transitions.
 * Post-processing includes soft gamut mapping, exposure, contrast, and
 * saturation controls. Optional dithering (IGN smooth or grain noise)
 * reduces banding artifacts.
 */

import type { CSSProperties } from 'react'
import { defineShader } from './shader-renderer.tsx'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LiquidGradientShaderProps {
  /** Color palette for the gradient (max 8). Hex strings like "#2962FF". */
  colors?: string[]
  /** Seed for turbulence variation. Different seeds = different flow patterns. */
  seed?: number
  /** Animation speed multiplier. 0 = frozen, 0.3 = default, 2 = fast. */
  speed?: number
  /** Loop duration in seconds. 0 = no loop, >0 = seamless loop over that many seconds. */
  loop?: number
  /** UV scale of the turbulence field. Higher = more zoomed in. */
  scale?: number
  /** Turbulence amplitude. Controls how far the flow displaces colors. */
  turbAmp?: number
  /** Turbulence frequency. Controls the spacing of turbulence waves. */
  turbFreq?: number
  /** Turbulence iteration count. Higher = more detail, more GPU cost. */
  turbIter?: number
  /** Wave frequency for the final color band mapping. */
  waveFreq?: number
  /** Distribution bias. Shifts where color bands fall in the gradient. */
  distBias?: number
  /** Jellify mode (0 or 1). Squashes one axis for a jelly-like feel. */
  jellify?: number
  /** Dither mode: 0 = Off, 1 = Smooth (IGN), 2 = Grain (quick noise). */
  ditherMode?: number
  /** Dither amount. Higher = more visible noise to fight banding. */
  dither?: number
  /** Exposure multiplier. Brightens or darkens the overall output. */
  exposure?: number
  /** Contrast adjustment applied in Oklab space. */
  contrast?: number
  /** Saturation adjustment applied in Oklab space. */
  saturation?: number
  style?: CSSProperties
}

// ---------------------------------------------------------------------------
// Fragment shader body
// ---------------------------------------------------------------------------

/**
 * Raw GLSL fragment body from LiquidGradient.js.
 * The defineShader engine prepends #version, precision, v_uv, fragColor,
 * uniform declarations, and built-in uniforms automatically.
 *
 * Algorithm overview:
 *   1. PCG hash seeding: seed-derived offsets and rotation create a unique
 *      flow pattern per seed value
 *   2. Turbulence: 4 ephemeral layers, each with up to 13 sine-wave
 *      iterations that warp UV coordinates through amplitude-modulated
 *      displacement. Optional jellify mode squashes one axis
 *   3. Color mapping: turbulence value maps through paletteN() which
 *      interpolates user colors in Oklab LCH space for perceptually
 *      uniform, hue-preserving gradients
 *   4. Dithering: IGN (smooth) or quick noise (grain) reduces banding
 *   5. Post-processing: exposure, contrast/saturation in Oklab, and soft
 *      gamut mapping to clamp out-of-range colors gracefully
 */
const FRAGMENT_SOURCE = `
// === CONSTANTS ===
const float GOLDEN_ANGLE = 2.3999632;
const float TAU = 6.28318530;

// === PCG hash - https://www.jcgt.org/published/0009/03/02/
uvec3 hash3(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

// Seed
vec3 seedRandom(float seedVal) {
    uvec3 s = uvec3(
        floatBitsToUint(seedVal),
        floatBitsToUint(seedVal * 1.5 + 7.31),
        floatBitsToUint(seedVal * 2.7 + 13.37)
    );
    s = hash3(s);
    return vec3(s) / float(0xFFFFFFFFu);
}

// === COLOR SPACE UTILITIES ===
vec3 toLinear(vec3 c) {
    return pow(c, vec3(2.2));
}

vec3 toSrgb(vec3 c) {
    return pow(clamp(c, 0.0, 1.0), vec3(0.4545));
}

vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

    l = pow(max(l, 0.0), 1.0/3.0);
    m = pow(max(m, 0.0), 1.0/3.0);
    s = pow(max(s, 0.0), 1.0/3.0);

    return vec3(
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
}

vec3 oklabToLinear(vec3 c) {
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

    l = l * l * l;
    m = m * m * m;
    s = s * s * s;

    return vec3(
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

vec3 oklabToLch(vec3 lab) {
    return vec3(lab.x, length(lab.yz), atan(lab.z, lab.y));
}

vec3 lchToOklab(vec3 lch) {
    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

vec3 mixLch(vec3 lab0, vec3 lab1, float t) {
    vec3 lch0 = oklabToLch(lab0);
    vec3 lch1 = oklabToLch(lab1);

    if (lch0.y < 0.05) lch0.z = lch1.z;
    if (lch1.y < 0.05) lch1.z = lch0.z;

    float dh = lch1.z - lch0.z;
    if (dh > 3.14159265) dh -= 6.28318530;
    if (dh < -3.14159265) dh += 6.28318530;

    return lchToOklab(vec3(
        mix(lch0.x, lch1.x, t),
        mix(lch0.y, lch1.y, t),
        lch0.z + dh * t
    ));
}

// === PALETTE SAMPLING ===
vec3 getColor(int idx) {
    if (u_colors_length < 1) return vec3(0.0);
    int safeIdx = clamp(idx, 0, u_colors_length - 1);
    return u_colors[safeIdx].rgb;
}

vec3 paletteN(float t, int count) {
    if (count < 1) return vec3(0.0);
    if (count < 2) return toLinear(getColor(0));

    float segmentSize = 1.0 / float(count - 1);
    t = clamp(t, 0.0, 1.0);
    int idx = min(int(floor(t / segmentSize)), count - 2);
    float localT = clamp((t - float(idx) * segmentSize) / segmentSize, 0.0, 1.0);

    vec3 lab0 = linearToOklab(toLinear(getColor(idx)));
    vec3 lab1 = linearToOklab(toLinear(getColor(idx + 1)));

    return oklabToLinear(mixLch(lab0, lab1, localT));
}

// === DITHER ===
float IGN(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

float quickNoise(vec2 I) {
    return fract(sin(dot(I, vec2(12.9898, 78.233))) * 43758.5453);
}

// Dither Mode: 0=Off, 1=IGN, 2=quickNoise
float getDither(vec2 I, float mode) {
    if (mode < 0.5) return 0.5;          // 0: Off
    if (mode < 1.5) return IGN(I);       // 1: Smooth
    return quickNoise(I);                // 2: Grain
}

// === POST-PROCESS ===
vec3 softGamutMap(vec3 linearRgb) {
    float maxC = max(linearRgb.r, max(linearRgb.g, linearRgb.b));
    float minC = min(linearRgb.r, min(linearRgb.g, linearRgb.b));

    if (minC >= 0.0 && maxC <= 1.0) return linearRgb;

    vec3 lab = linearToOklab(max(linearRgb, 0.0));
    float L = clamp(lab.x, 0.0, 1.0);
    float C = length(lab.yz);
    float h = atan(lab.z, lab.y);

    float maxChroma = 0.4 * (1.0 - pow(abs(2.0 * L - 1.0), 2.0));

    if (C > maxChroma * 0.7) {
        float knee = maxChroma * 0.7;
        C = knee + (maxChroma - knee) * tanh((C - knee) / (maxChroma - knee + 0.001));
    }

    return clamp(oklabToLinear(vec3(L, C * cos(h), C * sin(h))), 0.0, 1.0);
}

vec3 applyContrastSaturation(vec3 linearRgb, float contrast, float saturation) {
    vec3 lab = linearToOklab(linearRgb);
    float C = length(lab.yz);
    float h = atan(lab.z, lab.y);

    lab.x = clamp((lab.x - 0.5) * contrast + 0.5, 0.0, 1.0);
    C *= saturation;
    lab.y = C * cos(h);
    lab.z = C * sin(h);

    return oklabToLinear(lab);
}

// === MAIN ===
void main() {
    vec2 fragCoord = v_uv * u_resolution;
    vec2 r = u_resolution;
    vec2 p = (fragCoord * 2.0 - r) / r.y;

    int colorCount = u_colors_length;

    // Early out: no colors -> black
    if (colorCount < 1) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float t = u_time * 0.3;

    // Map time onto a circle so animation seamlessly wraps.
    float looping = step(0.5, u_loop);
    float phase = TAU * u_time / max(u_loop, 0.01);
    float radius = u_loop * u_speed * 0.3 / TAU;
    float tA = sin(phase) * radius;
    float tB = (1.0 - cos(phase)) * radius;

    // Seed-based offsets
    vec3 seedOffset = seedRandom(u_seed);
    vec3 seedOffset2 = seedRandom(u_seed + 100.0);

    // Golden angle rotation
    float seedAngle = u_seed * GOLDEN_ANGLE;
    vec2 seedPhase = (seedOffset2.xy - 0.5) * TAU;

    // Seed-based rotation
    float cs = cos(seedAngle);
    float sn = sin(seedAngle);
    p = mat2(cs, -sn, sn, cs) * p;

    // Get dither value
    float dither = getDither(floor(fragCoord / u_pixelRatio), u_ditherMode);

    // === TURBULENCE ===
    float totalVal = 0.0;
    float totalWeight = 0.0;
    int turbIter = int(u_turbIter);

    float freq = 1.0 / max(u_turbFreq, 0.01);

    for (float i = 0.0; i < 4.0; i++) {
        float eph = i / 4.0;

        vec2 q = p * u_scale;
        float sq = eph * eph;

        if (u_jellify > 0.5) {
            q.yx *= mix(1.0, 0.5, 1.0 - exp(-sq));
        }

        float a = seedPhase.x;
        float d = seedPhase.y;

        for (int j = 2; j < 13; j++) {
            if (j >= turbIter) break;
            float fj = float(j);
            // When looping, use circular time. Otherwise original t.
            float t1 = mix(t * u_speed, tA, looping);
            float t2 = mix(t * u_speed, tB, looping);
            q += u_turbAmp * sin(q.yx / freq * fj + t1 + vec2(a, d) + seedOffset.xy * fj) / fj;
            a += cos(fj + d * 1.2 + q.x * 2.0 - t1 + seedOffset2.z + t2 * 0.3 * looping);
            d += sin(fj * q.y + a + seedOffset.z + t1 + seedOffset2.y + t2 * 0.3 * looping);
        }

        float v = 0.5 + 0.5 * sin(length(q.yx + vec2(a, d) * 0.2) * u_waveFreq + i * i + seedOffset.x);
        float weight = smoothstep(0.0, 0.5, eph) * smoothstep(1.0, 0.5, eph);
        totalVal += v * weight;
        totalWeight += weight;
    }

    float val = totalVal / totalWeight;
    val = clamp((val - 0.3) / 0.4, 0.0, 1.0);
    val = pow(val, exp(-u_distBias));
    val = clamp(val + (dither - 0.5) * u_dither, 0.0, 1.0);

    vec3 col = paletteN(val, colorCount);
    col *= u_exposure;
    col = applyContrastSaturation(col, u_contrast, u_saturation);
    col = softGamutMap(col);
    col = toSrgb(col);

    fragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Property controls matching the original Framer LiquidGradient module.
 * Ranges, defaults, and step sizes are preserved from the original.
 *
 * Notes on type mapping:
 *   - `jellify` is a Framer Boolean; mapped to a number 0/1 toggle since
 *     defineShader only supports number controls. The GLSL uses `> 0.5`.
 *   - `ditherMode` is a Framer Enum [0,1,2]; mapped to a number with step 1.
 *   - `loop` default 0 means no looping; values > 0 set the loop duration.
 */
export const LiquidGradientShader = defineShader({
  title: 'LiquidGradientShader',
  fragment: FRAGMENT_SOURCE,
  propertyControls: {
    colors: {
      type: 'array',
      control: { type: 'color' },
      maxCount: 8,
      maxVisible: 8,
      defaultValue: ['#00001A', '#2962FF', '#40BCFF', '#FFB8B5', '#FFC14F'],
    },
    seed: {
      type: 'number',
      defaultValue: 648,
      min: 0,
      max: 1000,
      step: 1,
    },
    speed: {
      type: 'number',
      defaultValue: 0.3,
      min: 0,
      max: 2,
      step: 0.01,
    },
    loop: {
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 60,
      step: 0.5,
    },
    scale: {
      type: 'number',
      defaultValue: 0.42,
      min: 0.1,
      max: 2,
      step: 0.01,
    },
    turbAmp: {
      type: 'number',
      defaultValue: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
    },
    turbFreq: {
      type: 'number',
      defaultValue: 0.1,
      min: 0.1,
      max: 2,
      step: 0.01,
    },
    turbIter: {
      type: 'number',
      defaultValue: 7,
      min: 3,
      max: 10,
      step: 1,
    },
    waveFreq: {
      type: 'number',
      defaultValue: 3.8,
      min: 0.1,
      max: 5,
      step: 0.1,
    },
    distBias: {
      type: 'number',
      defaultValue: 0,
      min: -1,
      max: 1,
      step: 0.1,
    },
    jellify: {
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 1,
      step: 1,
    },
    ditherMode: {
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 2,
      step: 1,
    },
    dither: {
      type: 'number',
      defaultValue: 0.05,
      min: 0,
      max: 0.2,
      step: 0.01,
    },
    exposure: {
      type: 'number',
      defaultValue: 1.1,
      min: 0.5,
      max: 2,
      step: 0.1,
    },
    contrast: {
      type: 'number',
      defaultValue: 1.1,
      min: 0.5,
      max: 2,
      step: 0.1,
    },
    saturation: {
      type: 'number',
      defaultValue: 1,
      min: 0,
      max: 2,
      step: 0.1,
    },
  },
}) as React.FC<LiquidGradientShaderProps>
