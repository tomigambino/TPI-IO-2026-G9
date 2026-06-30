import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

export class KruskalStrategyAlgorithm
  extends AbstractStrategyAlgorithm
  implements IStrategy
{
  execute(graphs: string): string {
    let g = this.dotToGraph(graphs);
    this.steps = [];

    const weightFn = (e: graphlib.Edge): number => g.edge(e) as number;

    const edges: (graphlib.Edge & { weight: number })[] = g
      .edges()
      .map(e => ({ ...e, weight: weightFn(e) }))
      .sort((a, b) => a.weight - b.weight);

    const nodes = g.nodes() as string[];
    const uf = new UnionFind(nodes);
    const mstEdges: { from: string; to: string; weight: number }[] = [];
    const mstNodeSet = new Set<string>();

    let first = true;
    for (const edge of edges) {
      const u = edge.v;
      const v = edge.w;
      const edgeKey = `${u}->${v}`;

      if (uf.find(u) !== uf.find(v)) {
        mstEdges.push({ from: u, to: v, weight: edge.weight });
        mstNodeSet.add(u);
        mstNodeSet.add(v);
        uf.union(u, v);

        if (first) {
          this.addStep(
            `Aristas ordenadas por peso. Considerando "${u}" ↔ "${v}" (peso: ${edge.weight}): ✓ se agrega al árbol`,
            "select", [edgeKey], Array.from(mstNodeSet), edge.weight
          );
          first = false;
        } else {
          this.addStep(
            `Considerando "${u}" ↔ "${v}" (peso: ${edge.weight}): ✓ no forma ciclo, se agrega al árbol`,
            "select", [edgeKey], Array.from(mstNodeSet), edge.weight
          );
        }
      } else {
        this.addStep(
          `Considerando "${u}" ↔ "${v}" (peso: ${edge.weight}): ✗ formaría un ciclo, se descarta`,
          "reject", [edgeKey], Array.from(mstNodeSet)
        );
      }
    }

    const totalWeight = mstEdges.reduce((sum, e) => sum + e.weight, 0);
    const finalEdges = mstEdges.map(e => `${e.from}->${e.to}`);

    this.addStep(
      `Árbol de expansión mínimo completado. Costo total: ${totalWeight}`,
      "complete", finalEdges, Array.from(mstNodeSet), totalWeight
    );

    const mst = new graphlib.Graph();
    for (const e of mstEdges) {
      mst.setEdge(e.from, e.to, e.weight);
    }
    return this.graphToDot(mst, g);
  }
}

class UnionFind {
  private parent: Record<string, string>;
  private rank: Record<string, number>;

  constructor(elements: string[]) {
    this.parent = {};
    this.rank = {};
    elements.forEach((e) => {
      this.parent[e] = e;
      this.rank[e] = 0;
    });
  }

  find(e: string): string {
    if (this.parent[e] !== e) {
      this.parent[e] = this.find(this.parent[e]);
    }
    return this.parent[e];
  }

  union(e1: string, e2: string): void {
    const root1 = this.find(e1);
    const root2 = this.find(e2);
    if (root1 !== root2) {
      if (this.rank[root1] > this.rank[root2]) {
        this.parent[root2] = root1;
      } else if (this.rank[root1] < this.rank[root2]) {
        this.parent[root1] = root2;
      } else {
        this.parent[root2] = root1;
        this.rank[root1]++;
      }
    }
  }
}
