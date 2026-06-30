import { IStrategy } from "./strategy.interface";
import { AlgorithmStep } from "./step.interface";

export interface IResolver {
    resolve(graph: string, startNode?: number | string): string;

    setStrategy(strategy: IStrategy): void;

    getSteps(): AlgorithmStep[];
}