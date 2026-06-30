import type { ProblemType } from '../types'
import { PROBLEM_LABELS } from '../utils'

interface Props {
  value: ProblemType
  onChange: (v: ProblemType) => void
}

const TYPES: ProblemType[] = ['shortest-path', 'mst', 'max-flow', 'redundant-paths']

export default function ProblemSelector({ value, onChange }: Props) {
  return (
    <div className="problem-selector">
      <h2>¿Qué problema querés resolver?</h2>
      <div className="problem-cards gap-4">
        {TYPES.map(t => {
          const { title, desc } = PROBLEM_LABELS[t]
          const active = t === value
          return (
            <button
              key={t}
              className={`problem-card ${active ? 'active' : ''}`}
              onClick={() => onChange(t)}
            >
              <span className="problem-title text-center w-full">{title}</span>
              <span className="problem-desc text-left w-full">{desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
