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

function nodeName(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i)
  return `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`
}

export function generateRandomGraph(count: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  for (let i = 0; i < count; i++) {
    const name = nodeName(i)
    nodes.push({ id: name, label: name })
  }

  const edges: GraphEdge[] = []
  const used = new Set<string>()

  const addEdge = (from: string, to: string) => {
    const key = `${from}-${to}`
    const rkey = `${to}-${from}`
    if (from === to || used.has(key) || used.has(rkey)) return
    used.add(key)
    used.add(rkey)
    edges.push({ from, to, weight: Math.floor(Math.random() * 9) + 1 })
  }

  for (let i = 1; i < count; i++) {
    const prev = Math.floor(Math.random() * i)
    addEdge(nodes[i].id, nodes[prev].id)
  }

  const extra = Math.floor(count * 0.6)
  for (let i = 0; i < extra; i++) {
    const a = Math.floor(Math.random() * count)
    let b = Math.floor(Math.random() * count)
    if (a === b) b = (b + 1) % count
    addEdge(nodes[a].id, nodes[b].id)
  }

  return { nodes, edges }
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
