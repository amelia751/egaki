/**
 * User-defined React components for the video.
 * Only exports components (no data) so React Fast Refresh works.
 * Data constants live in data.ts.
 *
 * No 'use client' needed: MDX renders fully on the client, so user
 * components are client components by default.
 */

import { FeaturePill } from 'egaki/src/vite/components'
import type { FEATURES } from './data'

export function FeatureGrid({ features }: { features: typeof FEATURES }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, auto)',
        gap: 20,
        padding: '24px 80px 0',
      }}
    >
      {features.map((f, i) => (
        <FeaturePill key={f.label} label={f.label} icon={f.icon} index={i} />
      ))}
    </div>
  )
}

/**
 * Demo: MDX expression props can be functions because rendering happens
 * on the client (no RSC serialization boundary). Used by the e2e tests.
 */
export function FnPropDemo({ format }: { format?: (s: string) => string }) {
  return (
    <span style={{ color: '#fafafa', fontSize: 40 }}>
      {format ? format('fn-props-work') : 'no-fn-prop'}
    </span>
  )
}
