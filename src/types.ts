export type ProblemType = 'shortest-path' | 'mst' | 'max-flow'

export interface GraphNode {
  id: string
  label: string
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
