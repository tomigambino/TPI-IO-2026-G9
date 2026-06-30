import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

type _Edge = { from: string; to: string; weight: number };

export class RedundantPathsStrategyAlgorithm extends AbstractStrategyAlgorithm implements IStrategy {
  execute(graphs: string, nodeStart: string | number, nodeEnd: string | number): string {
    const g = this.dotToGraph(graphs);
    this.steps = [];

    // Parse configuration from nodeEnd (format: "endNode|count")
    const endParts = String(nodeEnd).split('|');
    const start = String(nodeStart);
    const end = endParts[0];
    const countParam = endParts[1] || '2';

    const isMax = countParam === 'max';
    const requestedCount = isMax ? Infinity : (parseInt(countParam) || 2);

    this.addStep(
      `Iniciando búsqueda de rutas disjuntas desde "${start}" hasta "${end}"\n[Explorando]`,
      "explore",
      [],
      [start, end]
    );

    const paths: { path: string[]; cost: number; isNodeDisjoint: boolean }[] = [];
    const excludedNodes = new Set<string>();
    const excludedEdges = new Set<string>();

    // 1. First, search for node-disjoint paths
    while (paths.length < requestedCount) {
      const r = this.findShortestPath(g, start, end, excludedNodes, excludedEdges);
      if (!r) break;

      paths.push({ path: r.path, cost: r.cost, isNodeDisjoint: true });

      // Exclude intermediate nodes of the new path
      r.path.slice(1, -1).forEach(n => excludedNodes.add(n));
      // Exclude edges of the new path (both directions)
      this.getPathEdges(r.path, g).forEach(e => {
        excludedEdges.add(`${e.v}->${e.w}`);
        excludedEdges.add(`${e.w}->${e.v}`);
      });

      const pathIdx = paths.length;
      this.addStep(
        `Ruta ${pathIdx} (disjunta en nodos) encontrada: ${r.path.join(" → ")} (costo: ${r.cost})\n[Aceptado]`,
        "select",
        r.path.slice(0, -1).map((node, i) => `${node}->${r.path[i+1]}`),
        r.path,
        r.cost
      );
    }

    let limitReached = false;
    let realLimit = paths.length;

    // 2. If requested count is not satisfied, clear node exclusions and look for edge-disjoint paths
    if (paths.length < requestedCount) {
      excludedNodes.clear(); // Restore intermediate nodes

      while (paths.length < requestedCount) {
        const r = this.findShortestPath(g, start, end, excludedNodes, excludedEdges);
        if (!r) break;

        paths.push({ path: r.path, cost: r.cost, isNodeDisjoint: false });

        // Exclude edges of the new path
        this.getPathEdges(r.path, g).forEach(e => {
          excludedEdges.add(`${e.v}->${e.w}`);
          excludedEdges.add(`${e.w}->${e.v}`);
        });

        const pathIdx = paths.length;
        this.addStep(
          `Ruta ${pathIdx} (disjunta en enlaces) encontrada: ${r.path.join(" → ")} (costo: ${r.cost})\n[Aceptado]`,
          "select",
          r.path.slice(0, -1).map((node, i) => `${node}->${r.path[i+1]}`),
          r.path,
          r.cost
        );
      }
    }

    if (paths.length === 0) {
      this.addStep(
        `No es posible encontrar ninguna ruta independiente entre "${start}" y "${end}"\n[Rechazado]`,
        "reject",
        [],
        [start, end]
      );
      throw new Error(`No existe ningún camino entre "${start}" y "${end}".`);
    }

    if (paths.length < requestedCount && !isMax) {
      limitReached = true;
      realLimit = paths.length;
    }

    // Reconstruct DOT graph containing all paths
    const resultGraph = new graphlib.Graph({ directed: g.isDirected() });
    const allEdgesList: string[] = [];
    const allNodesList = new Set<string>();

    paths.forEach(pObj => {
      pObj.path.forEach(n => allNodesList.add(n));
      const pEdges = this.getPathEdges(pObj.path, g);
      pEdges.forEach(e => {
        resultGraph.setNode(e.v);
        resultGraph.setNode(e.w);
        resultGraph.setEdge(e.v, e.w, e.weight);
        allEdgesList.push(`${e.v}->${e.w}`);
      });
    });

    const totalCost = paths.reduce((sum, p) => sum + p.cost, 0);

    this.addStep(
      `Búsqueda completada. Encontradas ${paths.length} rutas disjuntas. Costo total: ${totalCost}\n[Completado]`,
      "complete",
      allEdgesList,
      Array.from(allNodesList),
      totalCost
    );

    const dotResult = this.graphToDot(resultGraph, g);

    return JSON.stringify({
      paths,
      requestedCount: isMax ? 'max' : requestedCount,
      limitReached,
      realLimit,
      dot: dotResult
    });
  }

  private findShortestPath(
    g: graphlib.Graph,
    start: string,
    end: string,
    excludedNodes: Set<string>,
    excludedEdges: Set<string>
  ): { path: string[]; cost: number } | null {
    const allNodes = g.nodes() as string[];
    const dist: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const unvisited = new Set<string>();

    for (const node of allNodes) {
      if (excludedNodes.has(node) && node !== start && node !== end) continue;
      dist[node] = Infinity;
      prev[node] = null;
      unvisited.add(node);
    }

    if (!unvisited.has(start) || !unvisited.has(end)) return null;
    dist[start] = 0;

    while (unvisited.size > 0) {
      let current: string | null = null;
      let minDist = Infinity;
      for (const node of unvisited) {
        if (dist[node] < minDist) {
          minDist = dist[node];
          current = node;
        }
      }

      if (current === null || minDist === Infinity) break;
      if (current === end) break;

      unvisited.delete(current);

      const rawNeighbors = g.isDirected()
        ? (g.successors(current) as string[]) || []
        : (g.neighbors(current) as string[]) || [];

      const neighbors = rawNeighbors
        .map(n => ({ node: n, weight: g.edge(current, n) as number }))
        .sort((a, b) => a.weight - b.weight)
        .map(item => item.node);

      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor)) continue;

        const edgeKey1 = `${current}->${neighbor}`;
        const edgeKey2 = `${neighbor}->${current}`;
        if (excludedEdges.has(edgeKey1) || (g.isDirected() ? false : excludedEdges.has(edgeKey2))) continue;

        const weight = g.edge(current, neighbor) as number;
        const newDist = dist[current] + weight;

        if (newDist < dist[neighbor]) {
          dist[neighbor] = newDist;
          prev[neighbor] = current;
        }
      }
    }

    if (dist[end] === Infinity) return null;

    const path: string[] = [];
    let current: string | null = end;
    while (current !== null) {
      path.unshift(current);
      current = prev[current];
    }
    return { path, cost: dist[end] };
  }

  private getPathEdges(path: string[], g: graphlib.Graph): { v: string; w: string; weight: number }[] {
    const edges: { v: string; w: string; weight: number }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const v = path[i];
      const w = path[i + 1];
      const weight = g.edge(v, w) as number;
      edges.push({ v, w, weight });
    }
    return edges;
  }
}
