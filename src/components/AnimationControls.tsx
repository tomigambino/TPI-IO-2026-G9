import { useCallback } from 'react'
import type { AlgorithmStep } from '../../core/interfaces/step.interface'

const TYPE_ICON: Record<string, string> = {
  explore: '🔍',
  select: '✅',
  reject: '⛔',
  complete: '🏁',
}

interface Props {
  steps: AlgorithmStep[]
  currentStep: number
  isPlaying: boolean
  playSpeed: number
  onStepChange: (step: number) => void
  onPlayToggle: () => void
  onSpeedChange: (speed: number) => void
  onClose: () => void
}

export default function AnimationControls({
  steps,
  currentStep,
  isPlaying,
  playSpeed,
  onStepChange,
  onPlayToggle,
  onSpeedChange,
  onClose,
}: Props) {
  const step = steps[currentStep]
  const total = steps.length
  const isLast = currentStep === total - 1
  const progress = total > 1 ? ((currentStep) / (total - 1)) * 100 : 0

  const handlePrev = useCallback(() => {
    if (currentStep > 0) onStepChange(currentStep - 1)
  }, [currentStep, onStepChange])

  const handleNext = useCallback(() => {
    if (currentStep < total - 1) onStepChange(currentStep + 1)
  }, [currentStep, total, onStepChange])

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSpeedChange(Number(e.target.value))
  }, [onSpeedChange])

  if (!step) return null

  return (
    <div className="animation-controls">
      <div className="animation-header">
        <span className="animation-title">Animación paso a paso</span>
        <button className="animation-close" onClick={onClose} title="Cerrar animación">✕</button>
      </div>

      <div className="animation-progress-bar">
        <div className="animation-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="animation-step-info">
        <span className="animation-step-count">
          Paso {currentStep + 1} / {total}
        </span>
        {step.accumulatedValue !== undefined && (
          <span className="animation-accumulated">
            {steps[total - 1]?.type === 'complete' && step.type === 'complete'
              ? 'Resultado'
              : 'Acumulado'}: {step.accumulatedValue}
          </span>
        )}
      </div>

      <div className="animation-controls-bar">
        <button
          className="anim-btn"
          onClick={handlePrev}
          disabled={currentStep === 0}
          title="Paso anterior"
        >
          ⏮
        </button>
        <button
          className="anim-btn anim-btn-play"
          onClick={onPlayToggle}
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="anim-btn"
          onClick={handleNext}
          disabled={isLast}
          title="Paso siguiente"
        >
          ⏭
        </button>

        <div className="anim-speed-group">
          <span className="anim-speed-label">🐢</span>
          <input
            type="range"
            className="anim-speed-slider"
            min="200"
            max="2500"
            step="100"
            value={playSpeed}
            onChange={handleSlider}
            title="Velocidad de animación"
          />
          <span className="anim-speed-label">🐇</span>
        </div>
      </div>

      <div className="animation-description">
        <span className="animation-type-icon">{TYPE_ICON[step.type] || '•'}</span>
        <p>{step.description}</p>
      </div>
    </div>
  )
}
