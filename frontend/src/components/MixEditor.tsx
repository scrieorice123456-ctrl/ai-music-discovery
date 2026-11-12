import { useState } from 'react'
import { SlidersHorizontal, RotateCcw, ArrowRight, LoaderCircle } from 'lucide-react'
import type { Lane, Mix } from '../types'
import { Modal } from './ui'
const config: { key: Lane; label: string; description: string }[] = [
  {
    key: 'similar',
    label: 'Familiar sounds',
    description: 'Unheard songs close to the artists and styles you love.',
  },
  {
    key: 'discovery',
    label: 'Fresh discoveries',
    description: 'New artists with a sound that feels like you.',
  },
  {
    key: 'experimental',
    label: 'A little adventure',
    description: 'Step outside your usual sound. Find a new side of you.',
  },
]
export default function MixEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Mix
  onSave: (mix: Mix) => Promise<void>
  onClose: () => void
}) {
  const [mix, setMix] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  function change(key: Lane, value: number) {
    const other = config.map((c) => c.key).filter((k) => k !== key)
    const room = 100 - value
    const total = mix[other[0]] + mix[other[1]]
    const first = Math.round(room * (total ? mix[other[0]] / total : 0.5))
    setMix({ ...mix, [key]: value, [other[0]]: first, [other[1]]: room - first })
  }
  async function save() {
    setSaving(true)
    setError('')
    try {
      await onSave(mix)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your mix.')
      setSaving(false)
    }
  }
  return (
    <Modal title="Find your perfect balance." onClose={onClose}>
      <p className="modal-intro">You’re in the DJ booth. Choose how far you want to wander.</p>
      <div className="mix-stack large">
        {config.map((c) => (
          <div
            key={c.key}
            className={`mix-segment segment-${c.key}`}
            style={{ width: `${mix[c.key]}%` }}
          />
        ))}
      </div>
      <div className="mix-controls">
        {config.map((c) => (
          <div className={`mix-control control-${c.key}`} key={c.key}>
            <label htmlFor={`mix-${c.key}`}>
              <span>
                <i />
                {c.label}
              </span>
              <b>
                {mix[c.key]}
                <small>%</small>
              </b>
            </label>
            <p>{c.description}</p>
            <input
              id={`mix-${c.key}`}
              aria-label={`${c.label} percentage`}
              type="range"
              min="0"
              max="100"
              value={mix[c.key]}
              onChange={(e) => change(c.key, +e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="mix-note">
        <SlidersHorizontal size={16} />
        <span>Always adds up to 100%. Actual picks depend on available unheard music.</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button
          className="text-button"
          onClick={() => setMix({ similar: 50, discovery: 30, experimental: 20 })}
        >
          <RotateCcw size={14} />
          Reset to default
        </button>
        <button className="button button-primary" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <>
              Save my mix <ArrowRight size={17} />
            </>
          )}
        </button>
      </footer>
    </Modal>
  )
}
