export interface AlgorithmStep {
  description: string
  type: 'explore' | 'select' | 'reject' | 'complete'
  highlightEdges: string[]
  highlightNodes: string[]
  accumulatedValue?: number
}
