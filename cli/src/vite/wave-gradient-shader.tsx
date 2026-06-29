'use client'

/**
 * WaveGradientShader — animated noise-driven gradient with wave distortion.
 *
 * Port of Framer's GradientWave shader module for Remotion/egaki.
 * Original source:
 *   https://framerusercontent.com/modules/qbISo04IgXwHvt1f08Bw/PqHx9uwswPwEixzYIrpZ/GradientWave.js
 *
 * A 4-color gradient is warped through seed-dependent noise rotation and
 * wave distortion. The seed controls flow directions, harmonic frequencies,
 * and phase offsets, so each seed produces a visually distinct pattern.
 * Two layers (rotated at seed-derived angles) are blended with a vertical
 * smoothstep, producing a rich organic gradient that evolves over time.
 */

import type { CSSProperties } from 'react'
import { defineShader } from './shader-renderer.tsx'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WaveGradientShaderProps {
  /** Color palette for the gradient (max 4). Hex strings like "#FF3624". */
  colors?: string[]
  /** Seed for noise and flow variation. Different seeds = different patterns. */
  seed?: number
  /** Animation speed multiplier. 0 = frozen, 1.5 = default, 3 = fast. */
  waveSpeed?: number
  /** Horizontal wave frequency. Controls how many waves fit across the X axis. */
  waveFreqX?: number
  /** Vertical wave frequency. Controls how many waves fit across the Y axis. */
  waveFreqY?: number
  /** Wave propagation angle in degrees. Rotates the entire wave pattern. */
  waveAngle?: number
  /** Wave distortion amplitude. Higher = more extreme warping. */
  waveAmplitude?: number
  /** Smoothstep mask softness. Controls how sharply wave edges blend. */
  maskSoftness?: number
  /** Mix amount between rotated noise and wave warp. 0 = pure rotation, 1 = pure wave. */
  blendAmount?: number
  style?: CSSProperties
}

// ---------------------------------------------------------------------------
// Fragment shader body
// ---------------------------------------------------------------------------

/**
 * Raw GLSL fragment body from GradientWave.js.
 * The defineShader engine prepends #version, precision, v_uv, fragColor,
 * uniform declarations, and built-in uniforms automatically.
 *
 * Algorithm overview:
 *   1. Noise rotation: seed-derived hash noise determines a rotation angle
 *      per pixel, creating an organic swirling base pattern
 *   2. Wave warp: UV coordinates are distorted by a seed-modulated wave
 *      function with configurable frequency, angle, amplitude, and softness
 *   3. Layer blend: the rotated UVs and warped UVs are mixed via blendAmount,
 *      then two color layers (each a smoothstep gradient between 2 colors)
 *      are combined with a vertical smoothstep for the final output
 *   4. Tone mapping: a subtle S-curve (col*col + 0.5*sqrt(col)) is mixed in
 *      at 30% to add richness
 */
const FRAGMENT_SOURCE = `
#define S(a,b,t) smoothstep(a,b,t)

mat2 Rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

vec2 hash(vec2 p) {
    float s = u_seed;
    vec2 k1 = vec2(2127.1 + s * 13.37, 81.17 + s * 7.31);
    vec2 k2 = vec2(1269.5 + s * 11.13, 283.37 + s * 5.79);
    p = vec2(dot(p, k1), dot(p, k2));
    return fract(sin(p) * (43758.5453 + s * 1.618));
}

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(
        mix(dot(-1.0 + 2.0 * hash(i), f),
            dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
    );
    return 0.5 + 0.5 * n;
}

vec3 getColor(int idx) {
    if (u_colors_length < 1) return vec3(0.0);
    int safeIdx = clamp(idx, 0, u_colors_length - 1);
    return u_colors[safeIdx].rgb;
}

float seedF(float base) {
    return base * (1.0 + 0.5 * sin(u_seed * 3.17 + base));
}

vec2 warpUV(vec2 uv) {
    float t = u_time * u_waveSpeed;

    float angleOffset = sin(u_seed * 2.73) * 30.0;
    mat2 dirRot = Rot(radians(u_waveAngle + angleOffset));
    vec2 ruv = dirRot * uv;

    float fxMod = seedF(u_waveFreqX);
    float fyMod = seedF(u_waveFreqY);

    float phaseX = fract(sin(u_seed * 7.19) * 437.58) * 6.2832;
    float phaseY = fract(cos(u_seed * 3.41) * 291.37) * 6.2832;

    // Core wave with seed-dependent harmonics
    float harmonic = sin(u_seed * 1.23) * 0.5;
    float a = fyMod * ruv.y - sin(ruv.x * fxMod + ruv.y - t + phaseX);
    a += harmonic * sin(ruv.x * fxMod * 2.0 + ruv.y * 0.5 + t * 0.7 + phaseY);

    // Smoothstep mask
    a = smoothstep(
        cos(a) * u_maskSoftness,
        sin(a) * u_maskSoftness + 3.,
        cos(a - fyMod * ruv.y) - sin(a - fxMod * ruv.x)
    );

    a *= u_waveAmplitude;

    uv = cos(a) * uv + sin(a) * vec2(-uv.y, uv.x);
    return uv;
}

void main() {
    vec2 fragCoord = v_uv * u_resolution;
    vec2 uv = fragCoord / u_resolution.xy;
    float ratio = u_resolution.x / u_resolution.y;
    float t = u_time * u_waveSpeed;

    vec2 tuv = uv - 0.5;

    vec2 seedShift = vec2(sin(u_seed * 4.37), cos(u_seed * 5.91)) * 100.0;
    float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) + seedShift);
    tuv.y *= 1.0 / ratio;
    tuv *= Rot(radians((degree - 0.5) * 720.0 + 180.0));
    tuv.y *= ratio;

    // Seed-rotate uv2 before warping
    vec2 uv2 = (fragCoord * 2.0 - u_resolution.xy) / (u_resolution.x + u_resolution.y) * 2.0;
    float preRotAngle = fract(sin(u_seed * 5.63) * 173.29) * 6.2832;
    uv2 *= Rot(preRotAngle);
    vec2 warped = warpUV(uv2) * 0.5 + 0.5;

    vec2 blendUV = mix(tuv, warped - 0.5, u_blendAmount);

    float layerRot1 = -5.0 + sin(u_seed * 1.83) * 20.0;
    float layerRot2 = 10.0 + cos(u_seed * 2.47) * 20.0;

    vec3 c0 = getColor(0);
    vec3 c1 = getColor(1);
    vec3 c2 = getColor(2);
    vec3 c3 = getColor(3);

    vec3 layer1 = mix(c0, c2, S(-0.3, 0.3, (blendUV * Rot(radians(layerRot1))).x));
    vec3 layer2 = mix(c3, c1, S(-0.3, 0.3, (blendUV * Rot(radians(layerRot2))).x));
    vec3 col = mix(layer1, layer2, S(0.3, -0.3, blendUV.y));

    col = mix(col, col * col + 0.5 * sqrt(col), 0.3);

    fragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Property controls matching the original Framer GradientWave module.
 * Ranges, defaults, and step sizes are preserved from the original.
 */
export const WaveGradientShader = defineShader({
  title: 'WaveGradientShader',
  fragment: FRAGMENT_SOURCE,
  propertyControls: {
    colors: {
      type: 'array',
      control: { type: 'color' },
      maxCount: 4,
      maxVisible: 4,
      defaultValue: ['#FF3624', '#9EABFF', '#FFAE00', '#E29EFF'],
    },
    seed: {
      type: 'number',
      defaultValue: 32,
      min: 0,
      max: 100,
      step: 1,
    },
    waveSpeed: {
      type: 'number',
      defaultValue: 1.5,
      min: 0,
      max: 3,
      step: 0.01,
    },
    waveFreqX: {
      type: 'number',
      defaultValue: 0.9,
      min: 0.1,
      max: 6,
      step: 0.1,
    },
    waveFreqY: {
      type: 'number',
      defaultValue: 6,
      min: 0.1,
      max: 6,
      step: 0.1,
    },
    waveAngle: {
      type: 'number',
      defaultValue: 105,
      min: -180,
      max: 180,
      step: 1,
    },
    waveAmplitude: {
      type: 'number',
      defaultValue: 2.1,
      min: 0.5,
      max: 3,
      step: 0.01,
    },
    maskSoftness: {
      type: 'number',
      defaultValue: 0.74,
      min: 0.01,
      max: 2,
      step: 0.01,
    },
    blendAmount: {
      type: 'number',
      defaultValue: 0.54,
      min: 0,
      max: 1,
      step: 0.01,
    },
  },
}) as React.FC<WaveGradientShaderProps>
