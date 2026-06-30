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

export function generateRandomGraph(count: number, directed: boolean): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const radius = Math.max(120, count * 22)
  for (let i = 0; i < count; i++) {
    const name = nodeName(i)
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    nodes.push({
      id: name,
      label: name,
      x: Math.round(radius * Math.cos(angle)),
      y: Math.round(radius * Math.sin(angle))
    })
  }

  const edges: GraphEdge[] = []
  const used = new Set<string>()

  const addEdge = (from: string, to: string) => {
    const key = directed ? `${from}->${to}` : `${from}-${to}`
    const rkey = directed ? `${to}->${from}` : `${to}-${from}`
    
    if (from === to) return false
    if (directed) {
      if (used.has(key)) return false
      used.add(key)
    } else {
      if (used.has(key) || used.has(rkey)) return false
      used.add(key)
      used.add(rkey)
    }
    
    edges.push({ from, to, weight: Math.floor(Math.random() * 9) + 1 })
    return true
  }

  // 1. Connect all nodes sequentially to guarantee a single component
  for (let i = 0; i < count - 1; i++) {
    addEdge(nodes[i].id, nodes[i + 1].id)
  }

  // 2. Prevent dead ends (callejón sin salida)
  // In undirected graph, close the cycle so all nodes have degree >= 2
  if (!directed && count > 2) {
    addEdge(nodes[count - 1].id, nodes[0].id)
  }

  // 3. Add extra random connections
  const extra = Math.floor(count * 0.6)
  let attempts = 0
  let added = 0
  while (added < extra && attempts < 150) {
    attempts++
    const a = Math.floor(Math.random() * count)
    const b = Math.floor(Math.random() * count)
    if (a !== b) {
      const success = addEdge(nodes[a].id, nodes[b].id)
      if (success) added++
    }
  }

  const nodeIds = new Set(nodes.map(n => n.id))
  const seenEdges = new Set<string>()
  const cleanEdges = edges.filter(e => {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) return false
    const key = directed ? `${e.from}->${e.to}` : [e.from, e.to].sort().join('-')
    if (seenEdges.has(key)) return false
    seenEdges.add(key)
    return true
  })
  return { nodes, edges: cleanEdges }
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
  'redundant-paths': {
    title: 'Rutas Redundantes',
    desc: 'Encontrar dos caminos independientes que no compartan conexiones',
  },
}
