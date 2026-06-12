/**
 * Tests for the easing curve engine.
 *
 * The golden values below are the ORIGINAL hardcoded sample arrays that were
 * extracted from Jitter's webpack bundle (before this file generated them
 * from functions). They pin the generator output: every preset is checked at
 * 10 spot indices per intensity level, plus structural invariants.
 *
 * During the port, ALL 3570 values (14 presets x 5 intensities x 51 samples)
 * were verified Object.is-identical to the extracted arrays. These spot
 * checks guard against regressions in the engine math.
 */
import { describe, expect, test } from 'vitest'

import {
  type Intensity,
  accelerateElasticSamples,
  accelerateImpulseSamples,
  bounceAnticipateSamples,
  bounceSamples,
  bounceThrowSamples,
  cubicBezier,
  decelerateElasticSamples,
  decelerateOvershootSamples,
  elasticSnapSamples,
  impulseOvershootSamples,
  impulseSlowSamples,
  lerpSamples,
  naturalThrowSamples,
  overshootBouncySamples,
  overshootElasticSamples,
  overshootSamples,
  polybezier,
} from './easing-curves.ts'

const SPOT_INDICES = [0, 1, 7, 13, 19, 25, 31, 37, 43, 50] as const

const GOLDEN: Record<string, Record<Intensity, number[]>> = {
  naturalThrow: {
    0: [0, -0.0004, -0.0275, -0.0921, -0.0621, 0.3395, 1.0399, 1.1399, 1.0314, 1],
    25: [0, -0.0005, -0.0453, -0.1428, -0.1247, 0.19, 0.9808, 1.1559, 1.0338, 1],
    50: [0, -0.0005, -0.0706, -0.1938, -0.1819, 0.0583, 0.8338, 1.1644, 1.0353, 1],
    75: [0, -0.0007, -0.0975, -0.2918, -0.2818, -0.0397, 0.7714, 1.198, 1.0418, 1],
    100: [0, -0.0008, -0.1164, -0.3903, -0.3819, -0.1404, 0.6832, 1.2223, 1.0467, 1],
  },
  decelerateOvershoot: {
    0: [0, 0.2145, 0.8308, 1.0582, 1.0982, 1.0661, 1.0335, 1.0137, 1.0035, 1],
    25: [0, 0.2486, 0.9403, 1.1731, 1.189, 1.1204, 1.0611, 1.0252, 1.0065, 1],
    50: [0, 0.2873, 1.058, 1.2874, 1.2684, 1.165, 1.0839, 1.0348, 1.0091, 1],
    75: [0, 0.4347, 1.2454, 1.4, 1.3216, 1.1915, 1.098, 1.041, 1.0108, 1],
    100: [0, 0.6371, 1.4202, 1.4889, 1.3572, 1.21, 1.1081, 1.0456, 1.0121, 1],
  },
  decelerateElastic: {
    0: [0, 0.2149, 0.7414, 0.9671, 1.0709, 1.1, 1.0805, 1.0411, 1.0115, 1],
    25: [0, 0.2642, 0.8047, 1.0237, 1.1226, 1.15, 1.1218, 1.0552, 1.0133, 1],
    50: [0, 0.3251, 0.8688, 1.0799, 1.1741, 1.2, 1.1642, 1.0638, 1.0137, 1],
    75: [0, 0.4212, 1.0067, 1.2265, 1.3235, 1.35, 1.3148, 1.1251, 1.0226, 1],
    100: [0, 0.5174, 1.1446, 1.3731, 1.4728, 1.5, 1.4704, 1.2162, 1.0302, 1],
  },
  accelerateImpulse: {
    0: [0, -0.0005, -0.0262, -0.0738, -0.0995, -0.0784, 0.0105, 0.1811, 0.4571, 1],
    25: [0, -0.0006, -0.0313, -0.0942, -0.1422, -0.1442, -0.0779, 0.079, 0.362, 1],
    50: [0, -0.0007, -0.0339, -0.1067, -0.1751, -0.2, -0.1606, -0.0241, 0.257, 1],
    75: [0, -0.0009, -0.0465, -0.1519, -0.2694, -0.3401, -0.3406, -0.2407, 0.0263, 1],
    100: [0, -0.0011, -0.0534, -0.1785, -0.334, -0.4539, -0.4997, -0.4487, -0.219, 1],
  },
  accelerateElastic: {
    0: [0, -0.0002, -0.0099, -0.0461, -0.0894, -0.1, -0.0763, 0.0101, 0.2036, 1],
    25: [0, -0.0002, -0.0131, -0.0685, -0.1363, -0.15, -0.1252, -0.0349, 0.1674, 1],
    50: [0, -0.0002, -0.0154, -0.0901, -0.1842, -0.2, -0.1741, -0.0799, 0.1312, 1],
    75: [0, -0.0003, -0.0253, -0.2024, -0.3329, -0.35, -0.3235, -0.2265, -0.0067, 1],
    100: [0, -0.0004, -0.0338, -0.3722, -0.4837, -0.5, -0.4728, -0.3731, -0.1446, 1],
  },
  elasticSnap: {
    0: [0, 0.0374, 0.6938, 1.0155, 1.0341, 1.0073, 0.9985, 0.9989, 0.9999, 1.0001],
    25: [0, 0.0507, 0.868, 1.088, 1.0153, 0.9919, 0.9983, 1.0007, 1.0002, 0.9999],
    50: [0, 0.0739, 1.0803, 1.0643, 0.9752, 1.0007, 1.0021, 0.9994, 1, 1],
    75: [0, 0.12, 1.2732, 0.9246, 1.0178, 0.9969, 1.0001, 1.0003, 0.9998, 1],
    100: [0, 0.2503, 0.9638, 1.0864, 0.9841, 0.9946, 1.0029, 0.9999, 0.9997, 1],
  },
  bounce: {
    0: [0, 0.0009, 0.0439, 0.1516, 0.3239, 0.5608, 0.8623, 0.9684, 0.9676, 1],
    25: [0, 0.0017, 0.0844, 0.2911, 0.622, 0.9751, 0.8814, 0.9117, 0.9864, 1],
    50: [0, 0.0036, 0.1771, 0.611, 0.8779, 0.7497, 0.8819, 0.938, 0.986, 1],
    75: [0, 0.0064, 0.3154, 0.9503, 0.6454, 0.8041, 0.8754, 0.9817, 0.9842, 1],
    100: [0, 0.0129, 0.6314, 0.56, 0.7178, 0.7621, 0.9245, 0.9541, 0.9972, 1],
  },
  bounceAnticipate: {
    0: [0, -0.312, -1.091, -0.25, 0.5362, 0.4344, 0.7219, 0.8843, 0.9941, 1],
    25: [0, -0.2805, -1.0932, -0.5893, 0.9879, 0.3642, 0.9834, 0.9, 0.9737, 1],
    50: [0, -0.2551, -1.0782, -0.8111, 0.3954, 0.505, 0.656, 0.8284, 0.9509, 1],
    75: [0, -0.2365, -1.0652, -0.9626, -0.0309, 0.7255, 0.5385, 0.9146, 0.9754, 1],
    100: [0, -0.2429, -1.1621, -1.1587, -0.2326, 0.7471, 0.4442, 0.9706, 0.9749, 1],
  },
  bounceThrow: {
    0: [0, 0.1176, 0.7764, 0.4171, 0.9877, 0.7378, 0.861, 0.9301, 0.9892, 1],
    25: [0, 0.1708, 0.7334, 0.3524, 0.5552, 0.8521, 0.8234, 0.9149, 0.9755, 1],
    50: [0, 0.2061, 0.7171, 0.3341, 0.3456, 0.7518, 0.842, 0.9146, 0.9687, 1],
    75: [0, 0.2215, 0.7562, 0.4077, 0.3207, 0.4954, 0.9317, 0.8906, 0.9953, 1],
    100: [0, 0.2124, 0.8436, 0.5714, 0.4552, 0.4949, 0.6907, 0.9883, 0.9576, 1],
  },
  impulseSlow: {
    0: [0, -0.0021, -0.0445, 0.0225, 0.3076, 0.5975, 0.7948, 0.9142, 0.9775, 1],
    25: [0, -0.0026, -0.0744, -0.1182, 0.1306, 0.5103, 0.7603, 0.9025, 0.9749, 1],
    50: [0, -0.0023, -0.0801, -0.1858, -0.0939, 0.3794, 0.7124, 0.8868, 0.9714, 1],
    75: [0, -0.003, -0.1348, -0.4006, -0.5995, -0.1034, 0.5564, 0.8363, 0.9601, 1],
    100: [0, -0.0024, -0.1252, -0.4364, -0.8436, -0.9544, 0.2787, 0.7605, 0.944, 1],
  },
  impulseOvershoot: {
    0: [0, -0.0036, -0.0922, -0.0004, 0.5079, 0.9071, 1.0402, 1.0393, 1.0103, 1],
    25: [0, -0.0046, -0.1285, -0.0668, 0.5603, 0.9749, 1.074, 1.0485, 1.0124, 1],
    50: [0, -0.0052, -0.1579, -0.136, 0.6332, 1.0386, 1.0987, 1.0533, 1.0135, 1],
    75: [0, -0.0113, -0.3777, -0.5814, 0.7836, 1.2858, 1.2451, 1.1111, 1.0287, 1],
    100: [0, -0.0142, -0.4997, -0.9951, 1.1135, 1.4876, 1.3082, 1.135, 1.0358, 1],
  },
  overshoot: {
    0: [0, 0.1632, 0.6829, 0.9265, 1.0324, 1.0477, 1.0265, 1.0105, 1.0026, 1],
    25: [0, 0.2168, 0.8435, 1.0785, 1.1234, 1.0823, 1.0407, 1.0165, 1.0042, 1],
    50: [0, 0.3067, 1.0551, 1.1997, 1.1519, 1.0857, 1.0427, 1.0176, 1.0046, 1],
    75: [0, 0.4862, 1.5158, 1.5525, 1.348, 1.1958, 1.1, 1.0422, 1.0112, 1],
    100: [0, 0.7533, 1.9953, 1.7321, 1.4428, 1.2546, 1.1327, 1.0569, 1.0153, 1],
  },
  overshootElastic: {
    0: [0, 0.0025, 0.1678, 0.685, 1.0242, 1.1, 1.0862, 1.0468, 1.0125, 1],
    25: [0, 0.0018, 0.1352, 0.7495, 1.0889, 1.15, 1.1342, 1.0692, 1.0148, 1],
    50: [0, 0.0014, 0.1068, 0.831, 1.1504, 1.2, 1.1842, 1.0901, 1.0154, 1],
    75: [0, 0.0014, 0.1046, 0.9685, 1.3005, 1.35, 1.3261, 1.155, 1.0239, 1],
    100: [0, 0.0013, 0.1014, 1.1166, 1.4511, 1.5, 1.4704, 1.2162, 1.0302, 1],
  },
  overshootBouncy: {
    0: [0, 0.001, 0.0631, 0.3011, 0.9441, 1.2, 1.1389, 1.0614, 1.0162, 1],
    25: [0, 0.001, 0.0606, 0.2711, 0.8628, 1.35, 1.22, 1.0928, 1.0242, 1],
    50: [0, 0.001, 0.0582, 0.249, 0.7417, 1.5, 1.2803, 1.115, 1.0298, 1],
    75: [0, 0.001, 0.0585, 0.2461, 0.7133, 1.7, 1.3355, 1.1298, 1.0326, 1],
    100: [0, 0.001, 0.0584, 0.2421, 0.6823, 1.9, 1.3601, 1.135, 1.0335, 1],
  },
}

const ALL_SAMPLES: Record<string, Record<Intensity, number[]>> = {
  naturalThrow: naturalThrowSamples,
  decelerateOvershoot: decelerateOvershootSamples,
  decelerateElastic: decelerateElasticSamples,
  accelerateImpulse: accelerateImpulseSamples,
  accelerateElastic: accelerateElasticSamples,
  elasticSnap: elasticSnapSamples,
  bounce: bounceSamples,
  bounceAnticipate: bounceAnticipateSamples,
  bounceThrow: bounceThrowSamples,
  impulseSlow: impulseSlowSamples,
  impulseOvershoot: impulseOvershootSamples,
  overshoot: overshootSamples,
  overshootElastic: overshootElasticSamples,
  overshootBouncy: overshootBouncySamples,
}

const INTENSITIES = [0, 25, 50, 75, 100] as const

describe('generated samples match the original Jitter-extracted values', () => {
  for (const [name, golden] of Object.entries(GOLDEN)) {
    test(name, () => {
      const samples = ALL_SAMPLES[name]!
      for (const intensity of INTENSITIES) {
        const actual = SPOT_INDICES.map((i) => samples[intensity][i])
        expect(actual, `${name}[${intensity}]`).toEqual(golden[intensity])
      }
    })
  }
})

describe('structural invariants', () => {
  test('every curve has 51 samples and starts at 0', () => {
    for (const samples of Object.values(ALL_SAMPLES)) {
      for (const intensity of INTENSITIES) {
        expect(samples[intensity]).toHaveLength(51)
        expect(samples[intensity][0]).toBe(0)
      }
    }
  })

  test('path-based curves end exactly at 1', () => {
    // elasticSnap is physics-based and may settle at e.g. 1.0001 or 0.9999.
    const { elasticSnap: _elasticSnap, ...pathAndBounce } = ALL_SAMPLES
    for (const samples of Object.values(pathAndBounce)) {
      for (const intensity of INTENSITIES) {
        expect(samples[intensity][50]).toBe(1)
      }
    }
  })
})

describe('cubicBezier', () => {
  test('is identity for linear control points', () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75)
    expect(linear(0.3)).toBe(0.3)
  })

  test('matches known css ease-like curve endpoints', () => {
    const ease = cubicBezier(0.5, 0, 0, 1)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBeGreaterThan(0.5)
  })

  test('throws on x control points outside [0, 1]', () => {
    expect(() => cubicBezier(-0.1, 0, 0.5, 1)).toThrow()
    expect(() => cubicBezier(0, 0, 1.5, 1)).toThrow()
  })
})

describe('polybezier', () => {
  test('returns anchor y exactly when x hits an anchor', () => {
    const curve = polybezier([
      { x: 0, y: 0, upper: 0 },
      { x: 0.5, y: 1.2, lower: 0.8, upper: 0.2 },
      { x: 1, y: 1, lower: 0.7 },
    ])
    expect(curve(0)).toBe(0)
    expect(curve(0.5)).toBe(1.2)
    expect(curve(1)).toBe(1)
  })
})

describe('lerpSamples', () => {
  test('interpolates linearly between samples and clamps', () => {
    const samples = [0, 1, 0.5]
    expect(lerpSamples(samples, 0)).toBe(0)
    expect(lerpSamples(samples, 0.25)).toBe(0.5)
    expect(lerpSamples(samples, 1)).toBe(0.5)
    expect(lerpSamples(samples, -1)).toBe(0)
    expect(lerpSamples(samples, 2)).toBe(0.5)
  })
})
