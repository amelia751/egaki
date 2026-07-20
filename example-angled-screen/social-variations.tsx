/**
 * Social media variations of the AngledScreen shader effect applied to
 * public/social.png (Akarso docs screenshot). One component per look;
 * video.mdx shows each in its own 1s section so an agent can screenshot
 * the mid-frame of every section and pick the best.
 */

import { AbsoluteFill } from 'remotion'
import { AngledScreen } from 'egaki/video'

function Shot(props: {
  bg: string
  perspective: number
  rotateX: number
  rotateY: number
  rotateZ?: number
  translateZ: number
  fog: number
  grain?: number
  border?: string
}) {
  return (
    <AbsoluteFill style={{ backgroundColor: props.bg }}>
      <AngledScreen
        perspective={props.perspective}
        rotateX={props.rotateX}
        rotateY={props.rotateY}
        rotateZ={props.rotateZ ?? 0}
        translateZ={props.translateZ}
        fog={props.fog}
        grainIntensity={props.grain ?? 0.025}
        backgroundColor={props.bg}
        width="88%"
        height="auto"
      >
        <img
          src="/social.png"
          style={{
            width: '100%',
            display: 'block',
            borderRadius: 14,
            border: props.border ?? '1px solid rgba(255,255,255,0.16)',
            boxSizing: 'border-box',
          }}
        />
      </AngledScreen>
    </AbsoluteFill>
  )
}

/** Classic hero: left side receding with soft blur. */
export function Var1() {
  return (
    <Shot
      bg="#0a0608"
      perspective={950}
      rotateX={9}
      rotateY={-17}
      translateZ={120}
      fog={0.45}
    />
  )
}

/** Mirrored: right side receding. */
export function Var2() {
  return (
    <Shot
      bg="#08060a"
      perspective={950}
      rotateX={8}
      rotateY={19}
      translateZ={110}
      fog={0.45}
    />
  )
}

/** Dramatic wide-angle: low perspective, steep angles, heavy DOF. */
export function Var3() {
  return (
    <Shot
      bg="#050505"
      perspective={620}
      rotateX={13}
      rotateY={-26}
      translateZ={40}
      fog={0.55}
      grain={0.035}
    />
  )
}

/** Subtle premium: long lens, gentle tilt, light blur. */
export function Var4() {
  return (
    <Shot
      bg="#0b0a0d"
      perspective={1500}
      rotateX={5}
      rotateY={-10}
      translateZ={170}
      fog={0.3}
      grain={0.02}
    />
  )
}

/** Top-down: tilted back, bottom edge falls away. */
export function Var5() {
  return (
    <Shot
      bg="#070508"
      perspective={900}
      rotateX={-16}
      rotateY={-7}
      translateZ={90}
      fog={0.5}
    />
  )
}

/** Z-rotation accent: slight roll for editorial energy. */
export function Var6() {
  return (
    <Shot
      bg="#0a0608"
      perspective={850}
      rotateX={10}
      rotateY={-21}
      rotateZ={3.5}
      translateZ={80}
      fog={0.5}
    />
  )
}

/** Pink-tinted backdrop echoing the Akarso accent color. */
export function Var7() {
  return (
    <Shot
      bg="#180a10"
      perspective={950}
      rotateX={9}
      rotateY={-17}
      translateZ={115}
      fog={0.5}
      border="1px solid rgba(255,160,190,0.28)"
    />
  )
}

/** Deep zoom crop: plane pushed close, edges bleed off-frame. */
export function Var8() {
  return (
    <Shot
      bg="#060606"
      perspective={800}
      rotateX={11}
      rotateY={-20}
      translateZ={230}
      fog={0.4}
    />
  )
}
