export type ProblemType = 'shortest-path' | 'mst' | 'max-flow' | 'redundant-paths'

export interface GraphNode {
  id: string
  label: string
  x?: number
  y?: number
}

export interface GraphEdge {
  from: string
  to: string
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  directed: boolean
}

export interface ResultData {
  title: string
  body: string
  total: string | null
  note: string
}
