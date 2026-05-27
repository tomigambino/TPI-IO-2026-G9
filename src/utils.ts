import type { GraphData, GraphNode, GraphEdge } from './types'

export function graphToDot(data: GraphData): string {
  const { nodes, edges, directed } = data
  const conn = directed ? '->' : '--'
  const parts: string[] = []

  for (const e of edges) {
    parts.push(`${e.from}${conn}${e.to}[label=${e.weight}]`)
  }

  for (const n of nodes) {
    if (!edges.some(e => e.from === n.id || e.to === n.id)) {
      parts.push(`${n.id}`)
    }
  }

  return parts.join(';')
}

export function parseDotResult(dot: string): { edges: { from: string; to: string; weight: number }[]; directed: boolean } {
  const directed = dot.includes('->')
  const sep = directed ? '->' : '--'
  const edges: { from: string; to: string; weight: number }[] = []

  const edgePattern = new RegExp(
    `(\\w+)\\s*${sep}\\s*(\\w+)\\s*\\[label=(\\d+(?:\\.\\d+)?)\\]`, 'g'
  )
  let match
  while ((match = edgePattern.exec(dot)) !== null) {
    edges.push({
      from: match[1],
      to: match[2],
      weight: parseFloat(match[3]),
    })
  }

  return { edges, directed }
}

export function buildNodeOptions(data: GraphData): { value: string; label: string }[] {
  const ids = new Set<string>()
  for (const n of data.nodes) ids.add(n.id)
  for (const e of data.edges) {
    ids.add(e.from)
    ids.add(e.to)
  }
  return Array.from(ids).map(id => ({ value: id, label: id }))
}

export const PROBLEM_LABELS: Record<string, { title: string; desc: string }> = {
  'shortest-path': {
    title: 'Camino más corto',
    desc: 'Encontrar la ruta más barata o rápida entre dos puntos',
  },
  mst: {
    title: 'Conectar todo al menor costo',
    desc: 'Unir todos los puntos usando la menor cantidad de recursos posible',
  },
  'max-flow': {
    title: 'Flujo máximo',
    desc: 'Calcular cuánto puede transportarse de un punto a otro',
  },
}
