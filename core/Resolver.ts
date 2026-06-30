import { IResolver } from "./interfaces/resolver.interface";
import { IStrategy } from "./interfaces/strategy.interface";
import { AlgorithmStep } from "./interfaces/step.interface";

export class Resolver implements IResolver {
    public strategy!: IStrategy;

    resolve(graph: string, startNode?: number | string, nodeEnd?: string | number): string {
        if (!this.strategy) {
            throw new Error("Strategy not found");
        }
        return this.strategy.execute(graph, startNode, nodeEnd);
    }

    setStrategy(strategy: IStrategy) {
        this.strategy = strategy;
    }

    getSteps(): AlgorithmStep[] {
        if (!this.strategy) return [];
        return this.strategy.getSteps();
    }
}