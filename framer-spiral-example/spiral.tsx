// Wrapper component for the Framer Spiral in a Remotion-compatible layout
import './framer/styles.css'
import SpiralFramerComponent from './framer/spiral'

export function Spiral() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
      }}
    >
      <SpiralFramerComponent.Responsive
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
