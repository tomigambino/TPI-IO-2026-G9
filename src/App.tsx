import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Sun, Moon, Image, Download, Upload } from 'lucide-react'
import type { ProblemType, GraphNode, GraphEdge, ResultData } from './types'
import type { AlgorithmStep } from '../core/interfaces/step.interface'
import type { GraphEditorHandle } from './components/GraphEditor'
import { graphToDot, parseDotResult, buildNodeOptions, PROBLEM_LABELS, generateRandomGraph } from './utils'
import ProblemSelector from './components/ProblemSelector'
import GraphEditor from './components/GraphEditor'
import ConfirmationModal from './components/ConfirmationModal'
import AnimationControls from './components/AnimationControls'
import { Resolver } from '../core/Resolver'
import { DijkstraStrategyAlgorithm } from '../core/DijkstraStrategyAlgorithm'
import { KruskalStrategyAlgorithm } from '../core/KruskalStrategyAlgorithm'
import { PrimStrategyAlgorithm } from '../core/PrimStrategyAlgorithm'
import { MaxFlowStrategyAlgorithm } from '../core/MaxFlowStrategyAlgorithm'
import { RedundantPathsStrategyAlgorithm } from '../core/RedundantPathsStrategyAlgorithm'

const resolver = new Resolver()
const MAX_UNDO = 50

type GraphSnapshot = { nodes: GraphNode[]; edges: GraphEdge[] }

const PATH_COLORS = [
  { name: 'Verde', hex: '#22c55e', bg: '#166534', border: '#4ade80' },
  { name: 'Azul', hex: '#3b82f6', bg: '#1e3a8a', border: '#60a5fa' },
  { name: 'Violeta', hex: '#a855f7', bg: '#581c87', border: '#c084fc' },
  { name: 'Naranja', hex: '#f97316', bg: '#7c2d12', border: '#fb923c' },
  { name: 'Cian', hex: '#06b6d4', bg: '#0e7490', border: '#22d3ee' },
  { name: 'Rosa', hex: '#ec4899', bg: '#831843', border: '#f472b6' },
  { name: 'Amarillo', hex: '#eab308', bg: '#713f12', border: '#facc15' },
]

const REDUNDANT_PATH_COLORS = [
  { name: 'Azul', hex: '#3b82f6', bg: '#1e3a8a', border: '#60a5fa' },
  { name: 'Naranja', hex: '#f97316', bg: '#7c2d12', border: '#fb923c' },
  { name: 'Violeta', hex: '#a855f7', bg: '#581c87', border: '#c084fc' },
  { name: 'Cian', hex: '#06b6d4', bg: '#0e7490', border: '#22d3ee' },
  { name: 'Rosa', hex: '#ec4899', bg: '#831843', border: '#f472b6' },
  { name: 'Amarillo', hex: '#eab308', bg: '#713f12', border: '#facc15' },
]

export default function App() {
  const [problem, setProblem] = useState<ProblemType>('shortest-path')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [startNode, setStartNode] = useState('')
  const [endNode, setEndNode] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)
  const [resultEdges, setResultEdges] = useState<(string | { id: string; color: string })[]>([])
  const [resultNodes, setResultNodes] = useState<(string | { id: string; color: string; border?: string })[]>([])
  const [stepEdges, setStepEdges] = useState<(string | { id: string; color: string })[]>([])
  const [stepNodes, setStepNodes] = useState<(string | { id: string; color: string; border?: string })[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)

  // Theme state
  const getInitialTheme = () => localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  // Undo / Redo state
  const [undoStack, setUndoStack] = useState<GraphSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<GraphSnapshot[]>([])

  // Animation state
  const [steps, setSteps] = useState<AlgorithmStep[]>([])
  const [currentStepIdx, setCurrentStepIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1500)
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [canvasMode, setCanvasMode] = useState<'edit' | 'solution'>('edit')
  const [showAnimation, setShowAnimation] = useState(false)

  const graphEditorRef = useRef<GraphEditorHandle>(null)
  const [nodeCountInput, setNodeCountInput] = useState('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [redundantPathsCount, setRedundantPathsCount] = useState<string>('2')
  const resultDataRef = useRef<any>(null)

  // Input fields
  const [newNodeName, setNewNodeName] = useState('')
  const [edgeFrom, setEdgeFrom] = useState('')
  const [edgeTo, setEdgeTo] = useState('')
  const [edgeWeight, setEdgeWeight] = useState('')
  const [selectedEdge, setSelectedEdge] = useState<{ originalFrom: string; originalTo: string; from: string; to: string; weight: string } | null>(null)

  const directed = useMemo(() => problem === 'max-flow', [problem])

  const nodeOptions = useMemo(() => buildNodeOptions({ nodes, edges, directed }), [nodes, edges])

  const needsStartEnd = problem === 'shortest-path' || problem === 'max-flow' || problem === 'redundant-paths'

  const clearAnimation = useCallback(() => {
    setIsPlaying(false)
    setSteps([])
    setCurrentStepIdx(-1)
  }, [])

  // Capture current graph state for undo
  const pushUndo = useCallback(() => {
    setUndoStack(prev => {
      const next = [...prev, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }]
      if (next.length > MAX_UNDO) next.shift()
      return next
    })
    setRedoStack([])
  }, [nodes, edges])

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(prevStack => [...prevStack, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }])
    setUndoStack(prev => prev.slice(0, -1))
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setResult(null)
    setError(null)
    clearAnimation()
  }, [undoStack, nodes, edges, clearAnimation])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(prev => [...prev, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }])
    setRedoStack(prev => prev.slice(0, -1))
    setNodes(next.nodes)
    setEdges(next.edges)
    setResult(null)
    setError(null)
    clearAnimation()
  }, [redoStack, nodes, edges, clearAnimation])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' && e.shiftKey || e.key === 'y')) {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // Cleanup play timer
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [])

  // Play timer effect
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIdx(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, playSpeed)
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current)
        playTimerRef.current = null
      }
    }
    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current)
        playTimerRef.current = null
      }
    }
  }, [isPlaying, playSpeed, steps.length])

  // Update step-specific highlights for mini graph
  useEffect(() => {
    if (currentStepIdx >= 0 && currentStepIdx < steps.length) {
      const step = steps[currentStepIdx]
      setStepEdges(step.highlightEdges)
      setStepNodes(step.highlightNodes)
    }
  }, [currentStepIdx, steps])

  const handleAddNode = useCallback(() => {
    const name = newNodeName.trim()
    if (!name) return
    if (nodes.some(n => n.id === name)) {
      setError(`Ya existe un punto llamado "${name}"`)
      return
    }
    pushUndo()
    
    // Find a coordinate with min 80px distance from others
    let newX = 0
    let newY = 0
    if (nodes.length > 0) {
      let found = false
      let attempts = 0
      while (!found && attempts < 50) {
        const angle = Math.random() * Math.PI * 2
        const dist = 120 + Math.random() * 80
        const tx = Math.round(dist * Math.cos(angle))
        const ty = Math.round(dist * Math.sin(angle))
        
        const ok = nodes.every(n => {
          const dx = (n.x ?? 0) - tx
          const dy = (n.y ?? 0) - ty
          return Math.sqrt(dx * dx + dy * dy) >= 80
        })
        if (ok) {
          newX = tx
          newY = ty
          found = true
        }
        attempts++
      }
      if (!found) {
        const lastNode = nodes[nodes.length - 1]
        newX = (lastNode.x ?? 0) + 100
        newY = (lastNode.y ?? 0) + 50
      }
    }
    
    setNodes(prev => [...prev, { id: name, label: name, x: newX, y: newY }])
    setNewNodeName('')
    setError(null)
    setResult(null)
    clearAnimation()
  }, [newNodeName, nodes, pushUndo, clearAnimation])

  const handleAddEdge = useCallback(() => {
    const from = edgeFrom.trim()
    const to = edgeTo.trim()
    const weight = parseFloat(edgeWeight)
    if (!from || !to) return
    if (isNaN(weight) || weight <= 0) {
      setError('El costo debe ser un número positivo')
      return
    }
    if (from === to) {
      setError('No se puede conectar un punto consigo mismo')
      return
    }
    pushUndo()
    setEdges(prev => [...prev, { from, to, weight }])
    setEdgeFrom('')
    setEdgeTo('')
    setEdgeWeight('')
    setError(null)
    setResult(null)
    clearAnimation()
    document.getElementById('edge-from')?.focus()
  }, [edgeFrom, edgeTo, edgeWeight, pushUndo, clearAnimation])

  const handleDeleteNode = useCallback((id: string) => {
    pushUndo()
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    setResult(null)
    clearAnimation()
  }, [pushUndo, clearAnimation])

  const handleDeleteEdge = useCallback((from: string, to: string) => {
    const idx = edges.findIndex(e => e.from === from && e.to === to)
    if (idx !== -1) {
      pushUndo()
      setEdges(prev => prev.filter((_, i) => i !== idx))
      if (selectedEdge?.originalFrom === from && selectedEdge?.originalTo === to) {
        setSelectedEdge(null)
      }
      setResult(null)
      clearAnimation()
    }
  }, [edges, selectedEdge, pushUndo, clearAnimation])

  const handleEdgeClick = useCallback((from: string, to: string, weight: number) => {
    setSelectedEdge({
      originalFrom: from,
      originalTo: to,
      from,
      to,
      weight: String(weight),
    })
    setError(null)
  }, [])

  const handleClearSelectedEdge = useCallback(() => {
    setSelectedEdge(null)
  }, [])

  const handleExportImage = useCallback(async () => {
    const dataUrl = graphEditorRef.current?.exportImage()
    if (!dataUrl) return

    // Convert base64 dataUrl to blob
    const response = await fetch(dataUrl)
    const blob = await response.blob()

    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: 'grafo.png',
          types: [{
            description: 'PNG Image',
            accept: { 'image/png': ['.png'] }
          }]
        })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.error('File System Access API failed, falling back...', err)
      }
    }

    const link = document.createElement('a')
    link.download = 'grafo.png'
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleGenerateGraph = useCallback(() => {
    const parsed = parseInt(nodeCountInput)
    const count = isNaN(parsed) ? 5 : Math.max(2, Math.min(15, parsed))
    const graph = generateRandomGraph(count, directed)
    pushUndo()

    setStartNode('')
    setEndNode('')
    setResult(null)
    setError(null)
    setStepEdges([])
    setStepNodes([])
    clearAnimation()

    const nodeIds = new Set(graph.nodes.map(n => n.id))
    const seenEdges = new Set<string>()
    const cleanEdges = graph.edges.filter(e => {
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) return false
      const key = directed ? `${e.from}->${e.to}` : [e.from, e.to].sort().join('-')
      if (seenEdges.has(key)) return false
      seenEdges.add(key)
      return true
    })

    setNodes(graph.nodes)
    setEdges(cleanEdges)
    setSuccessMessage(`Grafo aleatorio generado con ${count} nodos`)
    setTimeout(() => setSuccessMessage(null), 3500)
  }, [nodeCountInput, directed, pushUndo, clearAnimation])

  const handleNodeDragEnd = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n))
  }, [])

  const handleExportJSON = useCallback(async () => {
    const dataStr = JSON.stringify({ nodes, edges }, null, 2)

    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: 'grafo.json',
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] }
          }]
        })
        const writable = await fileHandle.createWritable()
        await writable.write(dataStr)
        await writable.close()
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.error('File System Access API failed, falling back...', err)
      }
    }

    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    const link = document.createElement('a')
    link.download = 'grafo.json'
    link.href = dataUri
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [nodes, edges])

  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader()
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8")
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string)
          if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
            pushUndo()
            const validatedNodes = parsed.nodes.map((n: any) => ({
              id: String(n.id),
              label: String(n.label || n.id),
              x: typeof n.x === 'number' ? n.x : undefined,
              y: typeof n.y === 'number' ? n.y : undefined,
            }))
            const validatedEdges = parsed.edges.map((e: any) => ({
              from: String(e.from),
              to: String(e.to),
              weight: typeof e.weight === 'number' ? e.weight : parseFloat(e.weight) || 1,
            }))
            
            setNodes(validatedNodes)
            setEdges(validatedEdges)
            setStartNode('')
            setEndNode('')
            setResult(null)
            setError(null)
            clearAnimation()
            setSuccessMessage('Grafo importado con éxito')
            setTimeout(() => setSuccessMessage(null), 3000)
          } else {
            setError('El archivo JSON no tiene el formato de grafo válido.')
          }
        } catch (err) {
          setError('Error al leer el archivo JSON.')
        }
      }
      e.target.value = ''
    }
  }, [pushUndo, clearAnimation])

  const edgeNodeSuggestions = useMemo(() => {
    const query = edgeFrom.trim().toLowerCase()
    return nodeOptions.filter(option => option.value.toLowerCase().includes(query)).slice(0, 6)
  }, [edgeFrom, nodeOptions])

  const edgeToSuggestions = useMemo(() => {
    const query = edgeTo.trim().toLowerCase()
    return nodeOptions.filter(option => option.value.toLowerCase().includes(query)).slice(0, 6)
  }, [edgeTo, nodeOptions])

  const handleUpdateSelectedEdge = useCallback(() => {
    if (!selectedEdge) return

    const from = selectedEdge.from.trim()
    const to = selectedEdge.to.trim()
    const weight = parseFloat(selectedEdge.weight)

    if (!from || !to) return
    if (isNaN(weight) || weight <= 0) {
      setError('El costo debe ser un número positivo')
      return
    }
    if (from === to) {
      setError('No se puede conectar un punto consigo mismo')
      return
    }
    pushUndo()
    setEdges(prev =>
      prev.map(e =>
        e.from === selectedEdge.originalFrom && e.to === selectedEdge.originalTo
          ? { from, to, weight }
          : e
      )
    )
    setSelectedEdge({
      originalFrom: from,
      originalTo: to,
      from,
      to,
      weight: String(weight),
    })
    setError(null)
    setResult(null)
    clearAnimation()
  }, [selectedEdge, pushUndo, clearAnimation])

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return
    const { originalFrom, originalTo } = selectedEdge
    pushUndo()
    setEdges(prev => prev.filter(e => !(e.from === originalFrom && e.to === originalTo)))
    setSelectedEdge(null)
    setResult(null)
    clearAnimation()
  }, [selectedEdge, pushUndo, clearAnimation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.id === 'node-input') {
        handleAddNode()
      } else if (target.id === 'edge-from') {
        e.preventDefault()
        document.getElementById('edge-to')?.focus()
      } else if (target.id === 'edge-to') {
        e.preventDefault()
        document.getElementById('edge-weight')?.focus()
      } else if (target.id === 'edge-weight') {
        e.preventDefault()
        handleAddEdge()
      }
    }
  }, [handleAddNode, handleAddEdge])

  const getMappedStepHighlights = useCallback((step: AlgorithmStep, paths: any[]) => {
    if (problem !== 'redundant-paths' || !paths) {
      return { edges: step.highlightEdges, nodes: step.highlightNodes }
    }

    const edges: (string | { id: string; color: string })[] = []
    const nodes: (string | { id: string; color: string; border?: string })[] = []

    step.highlightEdges.forEach(eKey => {
      let foundPathIdx = -1
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i].path
        for (let k = 0; k < p.length - 1; k++) {
          const key1 = `${p[k]}->${p[k + 1]}`
          const key2 = `${p[k + 1]}->${p[k]}`
          if (eKey === key1 || eKey === key2) {
            foundPathIdx = i
            break
          }
        }
        if (foundPathIdx !== -1) break
      }

      if (foundPathIdx !== -1) {
        edges.push({ id: eKey, color: REDUNDANT_PATH_COLORS[foundPathIdx % REDUNDANT_PATH_COLORS.length].hex })
      } else {
        edges.push(eKey)
      }
    })

    step.highlightNodes.forEach(nId => {
      let foundPathIdx = -1
      for (let i = 0; i < paths.length; i++) {
        if (paths[i].path.includes(nId)) {
          foundPathIdx = i
          break
        }
      }

      const isStartOrEnd = nId === startNode || nId === endNode

      if (foundPathIdx !== -1) {
        nodes.push({
          id: nId,
          color: isStartOrEnd ? '#166534' : REDUNDANT_PATH_COLORS[foundPathIdx % REDUNDANT_PATH_COLORS.length].bg,
          border: isStartOrEnd ? '#4ADE80' : REDUNDANT_PATH_COLORS[foundPathIdx % REDUNDANT_PATH_COLORS.length].border
        })
      } else {
        nodes.push(nId)
      }
    })

    return { edges, nodes }
  }, [problem, startNode, endNode])

  const handleRun = useCallback(() => {
    setError(null)
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setStepEdges([])
    setStepNodes([])
    clearAnimation()

    if (nodes.length < 2) {
      setError('Agregá al menos dos puntos al mapa')
      return
    }
    if (edges.length === 0) {
      setError('Agregá al menos una conexión entre los puntos')
      return
    }
    if (needsStartEnd) {
      if (!startNode && !endNode) {
        setError('Seleccioná los puntos de origen y destino')
        return
      }
      if (!startNode) {
        setError('Seleccioná el punto de origen')
        return
      }
      if (!endNode) {
        setError('Seleccioná el punto de destino')
        return
      }
      if (startNode === endNode) {
        setError('El origen y el destino deben ser distintos')
        return
      }
    }

    const dot = graphToDot({ nodes, edges, directed })

    try {
      switch (problem) {
        case 'shortest-path': {
          resolver.setStrategy(new DijkstraStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, endNode)
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const parsed = parseDotResult(res)
          const pathNodes = new Set<string>()
          parsed.edges.forEach(e => { pathNodes.add(e.from); pathNodes.add(e.to) })
          const stepTexts = parsed.edges.map((e, i) => `${i + 1}. De "${e.from}" a "${e.to}" (costo: ${e.weight})`).join('\n')
          const total = parsed.edges.reduce((s, e) => s + e.weight, 0)
          setResult({
            title: 'Camino más corto encontrado',
            body: `Para ir de "${startNode}" a "${endNode}" de la forma más barata o rápida, seguí esta ruta:\n\n${stepTexts}`,
            total: `Costo total del viaje: ${total}`,
            note: 'Esta es la mejor ruta posible. Cualquier otro camino tendrá un costo igual o mayor.',
          })
          break
        }
        case 'mst': {
          resolver.setStrategy(new KruskalStrategyAlgorithm())
          const res = resolver.resolve(dot)
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const parsed = parseDotResult(res)
          const totalWeight = parsed.edges.reduce((sum, e) => sum + e.weight, 0)
          const connections = parsed.edges.map((e, i) => `${i + 1}. Unir "${e.from}" con "${e.to}" (costo: ${e.weight})`).join('\n')
          const isSingularConnection = parsed.edges.length === 1
          setResult({
            title: 'Conexión óptima encontrada',
            body: isSingularConnection
              ? `Para unir todos los puntos usando la menor cantidad de recursos, necesitas la siguiente conexión:\n\n${connections}`
              : `Para unir todos los puntos usando la menor cantidad de recursos, necesitas las siguientes ${parsed.edges.length} conexiones:\n\n${connections}`,
            total: `Costo total: ${totalWeight}`,
            note: 'Con esta red todos los puntos quedan conectados con la menor inversión posible.',
          })
          break
        }
        case 'max-flow': {
          resolver.setStrategy(new MaxFlowStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, endNode)
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const isSingularUnit = Number(res) === 1
          setResult({
            title: 'Flujo máximo calculado',
            body: isSingularUnit
              ? `Desde "${startNode}" hasta "${endNode}" se puede transportar exactamente 1 unidad.`
              : `Desde "${startNode}" hasta "${endNode}" se puede transportar un total de ${res} unidades.`,
            total: `Flujo máximo: ${res}`,
            note: isSingularUnit
              ? `Por más que intentes, no podrá pasar más de 1 unidad por esta red. Es el límite máximo que soportan las conexiones actuales.`
              : `Por más que intentes, no podrá pasar más de ${res} unidades por esta red. Es el límite máximo que soportan las conexiones actuales.`,
          })
          break
        }
        case 'redundant-paths': {
          resolver.setStrategy(new RedundantPathsStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, `${endNode}|${redundantPathsCount}`)
          const parsedRes = JSON.parse(res)
          resultDataRef.current = parsedRes
          
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          const colorMappedEdges: { id: string; color: string }[] = []
          const colorMappedNodes: { id: string; color: string; border?: string }[] = []

          parsedRes.paths.forEach((pObj: any, pathIdx: number) => {
            const colorCfg = REDUNDANT_PATH_COLORS[pathIdx % REDUNDANT_PATH_COLORS.length]
            
            pObj.path.forEach((nId: string) => {
              const isStartOrEnd = nId === startNode || nId === endNode
              const existing = colorMappedNodes.find(n => n.id === nId)
              if (!existing) {
                colorMappedNodes.push({
                  id: nId,
                  color: isStartOrEnd ? '#166534' : colorCfg.bg,
                  border: isStartOrEnd ? '#4ADE80' : colorCfg.border
                })
              }
            })

            for (let k = 0; k < pObj.path.length - 1; k++) {
              const u = pObj.path[k]
              const v = pObj.path[k + 1]
              const key1 = `${u}->${v}`
              const key2 = `${v}->${u}`
              colorMappedEdges.push({ id: key1, color: colorCfg.hex })
              colorMappedEdges.push({ id: key2, color: colorCfg.hex })
            }
          })

          setResultEdges(colorMappedEdges)
          setResultNodes(colorMappedNodes)

          if (algoSteps.length > 0) {
            const mapped = getMappedStepHighlights(algoSteps[0], parsedRes.paths)
            setStepEdges(mapped.edges)
            setStepNodes(mapped.nodes)
          }

          let bodyText = `Se calcularon rutas alternativas independientes de origen a destino:\n\n`
          parsedRes.paths.forEach((pObj: any, idx: number) => {
            const colorName = REDUNDANT_PATH_COLORS[idx % REDUNDANT_PATH_COLORS.length].name
            bodyText += `• Ruta ${idx + 1} (${colorName}): ${pObj.path.join(' → ')} (costo: ${pObj.cost})\n`
          })
          
          if (parsedRes.limitReached) {
            bodyText += `\n⚠️ Nota: No fue posible encontrar las ${parsedRes.requestedCount} rutas solicitadas. El límite real de rutas disjuntas en esta red es de ${parsedRes.realLimit}.`
          }

          setResult({
            title: 'Rutas Redundantes Encontradas',
            body: bodyText,
            total: `Costo total acumulado: ${parsedRes.paths.reduce((s: number, p: any) => s + p.cost, 0)}`,
            note: 'Cualquier interrupción en una ruta permitirá seguir operando a través de las alternativas de forma transparente.',
          })
          break
        }
      }
      setCanvasMode('solution')
      setShowAnimation(false)
    } catch (err) {
      setError(`Error al resolver: ${err instanceof Error ? err.message : 'desconocido'}`)
    }
  }, [problem, nodes, edges, startNode, endNode, directed, needsStartEnd, clearAnimation, redundantPathsCount, getMappedStepHighlights])

  const handleReset = useCallback(() => {
    setNodes([])
    setEdges([])
    setStartNode('')
    setEndNode('')
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setStepEdges([])
    setStepNodes([])
    setError(null)
    clearAnimation()
    setCanvasMode('edit')
    setShowAnimation(false)
  }, [clearAnimation])

  const handleConfirmReset = useCallback(() => {
    handleReset()
    setUndoStack([])
    setRedoStack([])
    setIsResetModalOpen(false)
  }, [handleReset])

  const handleStepChange = useCallback((step: number) => {
    setCurrentStepIdx(step)
    if (steps.length > 0) {
      const sObj = steps[step]
      let paths: any[] = []
      if (problem === 'redundant-paths' && resultDataRef.current) {
        paths = resultDataRef.current.paths
      }
      const mapped = getMappedStepHighlights(sObj, paths)
      setStepEdges(mapped.edges)
      setStepNodes(mapped.nodes)
    }
  }, [steps, problem, getMappedStepHighlights])

  const handlePlayToggle = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaySpeed(speed)
  }, [])

  const handleBackToEdit = useCallback(() => {
    setCanvasMode('edit')
    setShowAnimation(false)
    clearAnimation()
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setStepEdges([])
    setStepNodes([])
  }, [clearAnimation])

  const handleCloseAnimation = useCallback(() => {
    clearAnimation()
    setStepEdges([])
    setStepNodes([])
    setShowAnimation(false)
  }, [clearAnimation])

  const hasAnimation = steps.length > 0 && currentStepIdx >= 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Optimizador de Redes</h1>
        <button className="btn-theme-icon" onClick={toggleTheme} title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <ProblemSelector value={problem} onChange={(p) => { setProblem(p); setResult(null); setResultEdges([]); setResultNodes([]); setError(null); clearAnimation(); setCanvasMode('edit'); setShowAnimation(false); }} />

      <div className="main-layout gap-4">
        <div className="graph-column-wrapper" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="canvas-tabs">
            <button
              className={`canvas-tab ${canvasMode === 'edit' ? 'active' : ''}`}
              onClick={() => {
                setCanvasMode('edit')
                setIsPlaying(false)
              }}
            >
              Edición
            </button>
            <button
              className={`canvas-tab ${canvasMode === 'solution' ? 'active' : ''}`}
              onClick={() => setCanvasMode('solution')}
              disabled={!result}
              title={!result ? "Resolvé el problema para habilitar la pestaña de solución" : "Ver solución"}
            >
              Resolución
            </button>
          </div>

          <div className="panel graph-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <GraphEditor
              ref={graphEditorRef}
              nodes={nodes}
              edges={edges}
              directed={directed}
              highlightEdges={canvasMode === 'edit' ? [] : (showAnimation ? stepEdges : resultEdges)}
              highlightNodes={canvasMode === 'edit' ? [] : (showAnimation ? stepNodes : resultNodes)}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onEdgeClick={handleEdgeClick}
              onCanvasClick={handleClearSelectedEdge}
              onNodeDragEnd={handleNodeDragEnd}
              editable={canvasMode === 'edit'}
              theme={theme}
              stepType={showAnimation ? steps[currentStepIdx]?.type : 'complete'}
            />

            {canvasMode === 'solution' && !showAnimation && steps.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '4px 0 0 0' }}>
                <button
                  className="btn-run"
                  style={{ maxWidth: '280px', margin: 0 }}
                  onClick={() => {
                    setShowAnimation(true)
                    setCurrentStepIdx(0)
                    setIsPlaying(false) // PAUSED by default!
                  }}
                >
                  Ver animación paso a paso
                </button>
              </div>
            )}

            {showAnimation && steps.length > 0 && (
              <AnimationControls
                steps={steps}
                currentStep={currentStepIdx}
                isPlaying={isPlaying}
                playSpeed={playSpeed}
                onStepChange={handleStepChange}
                onPlayToggle={handlePlayToggle}
                onSpeedChange={handleSpeedChange}
                onClose={handleCloseAnimation}
              />
            )}

            {canvasMode === 'edit' && (
              <div className="graph-inputs">
                <div className="input-section">
                  <h4>Agregar punto</h4>
                  <div className="input-row">
                    <input
                      id="node-input"
                      type="text"
                      placeholder="Nombre del punto (ej: A)"
                      value={newNodeName}
                      onChange={e => setNewNodeName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={20}
                    />
                    <button onClick={handleAddNode}>Añadir</button>
                  </div>
                </div>

                <div className="input-section">
                  <h4>Agregar conexión</h4>
                  <div className="input-row">
                    <input
                      id="edge-from"
                      type="text"
                      placeholder="Desde"
                      value={edgeFrom}
                      onChange={e => setEdgeFrom(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={20}
                      list="nodes-list"
                    />
                    <span className="arrow">{directed ? '→' : '↔'}</span>
                    <input
                      id="edge-to"
                      type="text"
                      placeholder="Hasta"
                      value={edgeTo}
                      onChange={e => setEdgeTo(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={20}
                      list="nodes-list"
                    />
                    <input
                      id="edge-weight"
                      type="number"
                      placeholder="Costo"
                      value={edgeWeight}
                      onChange={e => setEdgeWeight(e.target.value)}
                      onKeyDown={handleKeyDown}
                      min="0.1"
                      step="any"
                      className="weight-input"
                    />
                    <button onClick={handleAddEdge}>Añadir</button>
                  </div>
                  <datalist id="nodes-list">
                    {nodeOptions.map(o => <option key={o.value} value={o.value} />)}
                  </datalist>
                </div>

                {selectedEdge && (
                  <div className="input-section edge-edit-section">
                    <h4>Editar / eliminar conexión seleccionada</h4>
                    <div className="input-row edge-edit-row">
                      <input
                        type="text"
                        placeholder="Desde"
                        value={selectedEdge.from}
                        onChange={e => setSelectedEdge(prev => prev ? { ...prev, from: e.target.value } : prev)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                        maxLength={20}
                        list="nodes-list"
                      />
                      <span className="arrow">{directed ? '→' : '↔'}</span>
                      <input
                        type="text"
                        placeholder="Hasta"
                        value={selectedEdge.to}
                        onChange={e => setSelectedEdge(prev => prev ? { ...prev, to: e.target.value } : prev)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                        maxLength={20}
                        list="nodes-list"
                      />
                      <input
                        type="number"
                        placeholder="Costo"
                        value={selectedEdge.weight}
                        onChange={e => setSelectedEdge(prev => prev ? { ...prev, weight: e.target.value } : prev)}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                        min="0.1"
                        step="any"
                        className="weight-input"
                      />
                      <div className="edge-actions">
                        <button onClick={handleUpdateSelectedEdge}>Actualizar</button>
                        <button className="btn-cancel" onClick={handleDeleteSelectedEdge}>Eliminar</button>
                      </div>
                    </div>
                    <p className="edit-hint">Seleccionaste "{selectedEdge.originalFrom}" → "{selectedEdge.originalTo}". Editá los campos y guardá los cambios, o eliminá la conexión.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="right-column">
          {canvasMode === 'edit' ? (
            <div className="panel controls-panel">
              <h3 style={{ margin: 0, marginBottom: '14px' }}>Acciones</h3>
              {needsStartEnd && (
                <div className="params-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="param-row">
                    <label>Origen</label>
                    <select value={startNode} onChange={e => setStartNode(e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {nodeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="param-row">
                    <label>Destino</label>
                    <select value={endNode} onChange={e => setEndNode(e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {nodeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {problem === 'redundant-paths' && (
                    <div className="param-row" style={{ marginTop: '4px' }}>
                      <label>Cantidad de rutas</label>
                      <select value={redundantPathsCount} onChange={e => setRedundantPathsCount(e.target.value)}>
                        <option value="2">2 rutas</option>
                        <option value="3">3 rutas</option>
                        <option value="4">4 rutas</option>
                        <option value="max">Máximas posibles</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <button className="btn-run" onClick={handleRun}>
                Resolver
              </button>

              <button className="btn-reset" onClick={() => setIsResetModalOpen(true)}>
                Empezar de nuevo
              </button>

              <div className="undo-redo-bar">
                <button className="btn-undo" onClick={handleUndo} disabled={undoStack.length === 0} title="Deshacer (Ctrl+Z)">
                  ↩ Deshacer
                </button>
                <button className="btn-redo" onClick={handleRedo} disabled={redoStack.length === 0} title="Rehacer (Ctrl+Shift+Z)">
                  ↪ Rehacer
                </button>
              </div>

              {successMessage && (
                <div className="result success-message">
                  <strong>{successMessage}</strong>
                </div>
              )}

              {error && (
                <div className="result error">
                  <strong>{error}</strong>
                </div>
              )}
            </div>
          ) : (
            <>
              {result && (
                <div className="panel result-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '15px', fontWeight: 700 }}>
                    {result.title}
                  </h3>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                    {result.body}
                  </div>
                  {result.total && (
                    <div className="result-card-total" style={{ margin: '8px 0 0 0', padding: '10px 14px' }}>
                      {result.total}
                    </div>
                  )}
                  {result.note && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {result.note}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="result error" style={{ marginTop: '12px' }}>
                  <strong>{error}</strong>
                </div>
              )}
            </>
          )}

          {canvasMode === 'edit' && (
            <div className="panel tools-panel">
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent)', marginBottom: '14px' }}>Herramientas de Grafo</h3>

              <div className="random-gen-section" style={{ marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <h5 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Generar grafo aleatorio</h5>
                <div className="param-row">
                  <div className="input-row" style={{ gap: '8px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={nodeCountInput}
                      onChange={e => setNodeCountInput(e.target.value)}
                      onBlur={e => {
                        const val = e.target.value.trim()
                        if (val === '') {
                          setNodeCountInput('')
                        } else {
                          const num = Math.max(2, Math.min(15, Number(val) || 5))
                          setNodeCountInput(String(num))
                        }
                      }}
                      placeholder="Cantidad de nodos"
                      className="node-count-input"
                      title="Cantidad de nodos (2-15)"
                      style={{ width: '100%' }}
                    />
                    <button className="btn-gen" onClick={handleGenerateGraph} style={{ flex: 'none' }}>Generar</button>
                  </div>
                </div>
              </div>

              <div className="tools-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="btn-export" onClick={handleExportImage} title="Exportar el grafo como imagen PNG">
                  <Image size={16} /> Exportar (PNG)
                </button>
                <button className="btn-export" onClick={handleExportJSON} title="Exportar el grafo en formato JSON">
                  <Download size={16} /> Exportar (JSON)
                </button>
                <button className="btn-export" onClick={() => document.getElementById('import-json')?.click()} title="Importar un grafo desde un archivo JSON">
                  <Upload size={16} /> Importar (JSON)
                </button>
                <input
                  type="file"
                  id="import-json"
                  accept=".json"
                  onChange={handleImportJSON}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleConfirmReset}
        title="¿Borrar todo?"
        message="Estás a punto de eliminar todos los puntos y conexiones que armaste. Esto no se puede deshacer."
      />
    </div>
  )
}
