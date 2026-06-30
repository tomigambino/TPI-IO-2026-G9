import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

type _Edge = { from: string; to: string; weight: number };

export class DijkstraStrategyAlgorithm extends AbstractStrategyAlgorithm implements IStrategy {
  execute(graphs: string, nodeStart: string | number, nodeEnd: string | number): string {
    let g = this.dotToGraph(graphs);
    this.steps = [];

    const start = String(nodeStart);
    const end = String(nodeEnd);
    const allNodes = g.nodes() as string[];

    const dist: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const unvisited = new Set(allNodes);

    for (const node of allNodes) {
      dist[node] = Infinity;
      prev[node] = null;
    }
    dist[start] = 0;

    this.addStep(
      `Iniciando Dijkstra desde "${start}" hacia "${end}"`,
      "explore", [], [start], 0
    );

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

      if (current === end) {
        this.addStep(
          `¡Llegamos al destino "${end}"! Distancia más corta: ${dist[end]}`,
          "select", [], [end], dist[end]
        );
        break;
      }

      unvisited.delete(current);

      this.addStep(
        `Visitando "${current}" (distancia más corta desde origen: ${dist[current]})`,
        "explore", [], [current], dist[current]
      );

      const neighbors = (g.neighbors(current) as string[]) || [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor)) continue;

        const weight = g.edge(current, neighbor) as number;
        const newDist = dist[current] + weight;

        if (newDist < dist[neighbor]) {
          const oldStr = dist[neighbor] === Infinity ? "∞" : String(dist[neighbor]);
          dist[neighbor] = newDist;
          prev[neighbor] = current;

          this.addStep(
            `Arista "${current}" → "${neighbor}" (peso: ${weight}): distancia ${oldStr} → ${newDist}`,
            "select", [`${current}->${neighbor}`], [current, neighbor], newDist
          );
        } else {
          this.addStep(
            `Arista "${current}" → "${neighbor}" (peso: ${weight}): distancia ${newDist} no mejora la actual (${dist[neighbor]}), se descarta`,
            "reject", [`${current}->${neighbor}`], [current, neighbor], dist[neighbor]
          );
        }
      }
    }

    if (dist[end] === Infinity) {
      this.addStep(
        `No hay camino desde "${start}" hasta "${end}"`,
        "complete", [], [], Infinity
      );
      return "digraph{rankdir=LR;}";
    }

    const path: string[] = [];
    let node: string | null = end;
    while (node !== null) {
      path.unshift(node);
      node = prev[node];
    }

    const pathEdges: _Edge[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const w = g.edge(path[i], path[i + 1]) as number;
      pathEdges.push({ from: path[i], to: path[i + 1], weight: w });
    }

    this.addStep(
      `¡Camino encontrado! ${path.join(" → ")} (costo total: ${dist[end]})`,
      "complete",
      pathEdges.map(e => `${e.from}->${e.to}`),
      path,
      dist[end]
    );

    let dot = "digraph{rankdir=LR;";
    for (const e of pathEdges) {
      dot += `${e.from}->${e.to}[label=${e.weight}];`;
    }
    return dot + "}";
  }
}
