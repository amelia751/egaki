'use client'

/**
 * BandsShader — chromatic dispersion through repeating lens bands.
 *
 * Port of Framer's DispersionBands shader module for Remotion/egaki.
 * Original source:
 *   https://framerusercontent.com/modules/jVqOzZrK81udrIw4uWLw/cV6qlarOv1tGcvTbyZeC/DispersionBands.js
 *
 * An animated gradient of user-defined colors is distorted through a tiled
 * grid of spherical lenses. Each lens splits light into RGB channels at its
 * edges (chromatic dispersion), producing rainbow fringing similar to light
 * passing through a prism. 8-sample temporal anti-aliasing with per-sample
 * spectral weighting gives the effect a soft, photographic quality.
 *
 * With the default lensSpacingY=0.01, lenses are essentially horizontal bands
 * spanning full height. Increasing lensSpacingY creates a 2D grid of individual
 * spherical lenses.
 */

import type { CSSProperties } from 'react'
import { defineShader } from './shader-renderer.tsx'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BandsShaderProps {
  /** Color palette for the gradient (max 8). Hex strings like "#4AB7FF". */
  colors?: string[]
  /** Seed for gradient flow directions and frequencies. Different seeds = different patterns. */
  seed?: number
  /** Animation speed multiplier. 0 = frozen, 0.3 = default, 2 = fast. */
  speed?: number
  /** Wavy spatial jitter per sample. 0 = clean, higher = dreamy/melting distortion. */
  ephemeralAmp?: number
  /** UV scale before the lens grid. Higher = more zoomed in, fewer visible lens cells. */
  lensScale?: number
  /** Horizontal spacing of the repeating lens cells. Smaller = more lens columns. */
  lensSpacingX?: number
  /** Vertical spacing of lens cells. At 0.01 (default) lenses are tall horizontal bands. */
  lensSpacingY?: number
  /** Radius of each lens sphere. Controls magnification area vs flat area. */
  lensRadius?: number
  /** How much R and B channels diverge from G at lens edges. 0 = none, 1 = maximum rainbow. */
  dispersionStrength?: number
  /** Extra rainbow tint multiplier at lens edges. Pushes edge colors toward prismatic look. */
  edgeDisp?: number
  style?: CSSProperties
}

// ---------------------------------------------------------------------------
// Fragment shader body
// ---------------------------------------------------------------------------

/**
 * Raw GLSL fragment body from DispersionBands.js.
 * The defineShader engine prepends #version, precision, v_uv, fragColor,
 * uniform declarations, and built-in uniforms automatically.
 *
 * Algorithm overview:
 *   1. Gradient flow: seed-derived sin/cos waves create an organic color field
 *   2. Band lens: UV is tiled into repeating cells; each cell has a spherical
 *      lens that warps UVs outward (magnification at center, edge factor at rim)
 *   3. Chromatic dispersion: lens applied 3× per sample (R, G, B) with different
 *      index-of-refraction offsets, splitting color channels at lens edges
 *   4. 8-sample TAA: per-pixel random offset + spectral tint weights, averaged
 */
const FRAGMENT_SOURCE = `
const int SAMPLES = 8;
const float EPHEMERAL_DRIP = 1.0;

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
uvec3 seed;
vec3 random3f() {
    seed = hash3(seed);
    return vec3(seed) / float(-1u);
}

vec3 seedRandom(float seedVal) {
    uvec3 s = uvec3(
        floatBitsToUint(seedVal),
        floatBitsToUint(seedVal * 1.5 + 7.31),
        floatBitsToUint(seedVal * 2.7 + 13.37)
    );
    s = hash3(s);
    return vec3(s) / float(0xFFFFFFFFu);
}

// === PALETTE SAMPLING ===
vec3 getColor(int idx) {
    if (u_colors_length < 1) return vec3(0.0);
    int safeIdx = clamp(idx, 0, u_colors_length - 1);
    return u_colors[safeIdx].rgb;
}

vec3 paletteN(float t, int count) {
    if (count < 1) return vec3(0.0);
    if (count < 2) return getColor(0);
    t = clamp(t, 0.0, 1.0) * float(count - 1);
    int idx = min(int(floor(t)), count - 2);
    float localT = fract(t);
    localT = localT * localT * (3.0 - 2.0 * localT);
    return mix(getColor(idx), getColor(idx + 1), localT);
}

// === Gradient Flow ===
float getGradientT(vec2 uv, float t, vec3 s1, vec3 s2) {
    // Seed-derived flow directions
    float angle1 = s1.x * 6.28;
    float angle2 = s1.y * 6.28;
    vec2 dir1 = vec2(cos(angle1), sin(angle1));
    vec2 dir2 = vec2(cos(angle2), sin(angle2));

    // Seed-derived frequencies
    float freq1 = 1.0 + s1.z * 2.0;
    float freq2 = 1.0 + s2.x * 1.5;
    float freq3 = 1.5 + s2.y * 2.0;

    float flow = dot(uv, dir1) + sin(dot(uv, dir2) * freq1 + t) * 0.3 + t * 0.2;
    float flow2 = dot(uv, dir2.yx) + cos(dot(uv, dir1.yx) * freq2 - t * 0.8) * 0.25;

    float gradT = sin(flow * 1.5) * 0.5 + 0.5;
    gradT += cos(flow2 * 1.2) * 1.3;
    gradT += sin(dot(uv, dir1 + dir2) * freq3 + t * 3.5) * 1.2;

    return smoothstep(0.0, 4.12, gradT);
}

// === BAND LENS ===
void applyBandLens(vec2 pp, float radiusSq, float iorOffset, out vec2 warpedUV, out float edgeFactor) {
    vec2 ppLens = pp;
    float spacingX = max(u_lensSpacingX, 0.001);
    float spacingY = max(u_lensSpacingY, 0.001);
    ppLens.x = fract(pp.x / spacingX + 0.5) * spacingX - spacingX * 0.5;
    ppLens.y = fract(pp.y / spacingY + 0.5) * spacingY - spacingY * 0.5;

    float sp = radiusSq - ppLens.x * ppLens.x - ppLens.y * ppLens.y;

    float lensAmount = smoothstep(-0.1, 0.05, sp);
    float baseLens = sqrt(max(sp, -sp * 0.1) / 0.3);
    edgeFactor = (1.0 - smoothstep(0.0, radiusSq, sp)) * lensAmount;

    float warpAmount = mix(1.0, baseLens * (1.0 + iorOffset), lensAmount);

    warpedUV = pp;
    warpedUV.x += (ppLens.x * warpAmount - ppLens.x);
    warpedUV.y *= warpAmount;
}

void main() {
    vec2 fragCoord = v_uv * u_resolution;
    seed = uvec3(uvec2(fragCoord), uint(fract(u_time) * 1000.0));

    vec2 r = u_resolution;
    vec2 p = (fragCoord * 2.0 - r) / r.y;
    float t = u_time * u_speed;

    int colorCount = u_colors_length;

    // Early out: no colors -> black
    if (colorCount < 1) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Seed-based offsets for gradient flow
    vec3 seedOff1 = seedRandom(u_seed);
    vec3 seedOff2 = seedRandom(u_seed + 100.0);

    float dice = random3f().x;

    float radiusSq = u_lensRadius * u_lensRadius;
    vec3 iorOffsets = vec3(-1.0, 0.0, 1.0) * u_dispersionStrength;

    vec3 col = vec3(0.0);

    for (int i = 0; i < SAMPLES; i++) {
        float ephemeral = (float(i) + dice) / float(SAMPLES);
        float sqEph = ephemeral * ephemeral;

        vec2 pt = p;
        pt.x += u_ephemeralAmp * sqEph * sin(p.y * 2.0 + t);
        pt.y += u_ephemeralAmp * sqEph * cos(p.x * 1.5 - t) * 0.5;
        pt.y -= (1.0 - exp(-EPHEMERAL_DRIP * sqEph)) * abs(pt.y) * sign(pt.y) * 0.3;

        vec3 tint = smoothstep(1.0, 0.0, abs(3.0 * ephemeral - vec3(1.0, 1.5, 2.0)));

        vec3 gradTs = vec3(0.0);
        vec3 edgeFactors = vec3(0.0);

        for (int c = 0; c < 3; c++) {
            vec2 pp = pt * u_lensScale;
            vec2 warpedUV;
            float edgeFactor;
            applyBandLens(pp, radiusSq, iorOffsets[c], warpedUV, edgeFactor);

            vec2 gradUV = warpedUV / u_lensScale;
            gradTs[c] = getGradientT(gradUV, t * 0.8, seedOff1, seedOff2);
            edgeFactors[c] = edgeFactor;
        }

        vec3 convergentColor = paletteN(gradTs.g, colorCount);
        float edgeMix = max(max(edgeFactors.r, edgeFactors.g), edgeFactors.b);

        vec3 dispersedColor = vec3(
            paletteN(gradTs.r, colorCount).r,
            convergentColor.g,
            paletteN(gradTs.b, colorCount).b
        );

        vec3 finalColor = mix(convergentColor, dispersedColor, edgeMix * 2.0);

        vec3 rainbow = (gradTs - gradTs.g) * 3.0;
        finalColor += rainbow * edgeMix * u_edgeDisp;

        col += tint * finalColor * (3.0 / float(SAMPLES));
    }

    fragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Property controls matching the original Framer DispersionBands module.
 * Ranges, defaults, and step sizes are preserved from the original.
 */
export const BandsShader = defineShader({
  title: 'BandsShader',
  fragment: FRAGMENT_SOURCE,
  propertyControls: {
    colors: {
      type: 'array',
      control: { type: 'color' },
      maxCount: 8,
      maxVisible: 4,
      defaultValue: ['#4AB7FF', '#000000', '#FF4040'],
    },
    seed: {
      type: 'number',
      defaultValue: 210,
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
    ephemeralAmp: {
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    lensScale: {
      type: 'number',
      defaultValue: 3.7,
      min: 0.1,
      max: 10,
      step: 0.1,
    },
    lensSpacingX: {
      type: 'number',
      defaultValue: 1,
      min: 0.01,
      max: 5,
      step: 0.01,
    },
    lensSpacingY: {
      type: 'number',
      defaultValue: 0.01,
      min: 0.01,
      max: 5,
      step: 0.01,
      hidden: true,
    },
    lensRadius: {
      type: 'number',
      defaultValue: 0.58,
      min: 0.1,
      max: 2,
      step: 0.01,
    },
    dispersionStrength: {
      type: 'number',
      defaultValue: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
    },
    edgeDisp: {
      type: 'number',
      defaultValue: 2,
      min: 0,
      max: 5,
      step: 0.1,
    },
  },
}) as React.FC<BandsShaderProps>
