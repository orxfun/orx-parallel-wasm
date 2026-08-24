/** Minimal typings for the Webpack plugin exported by the package. */

export interface OrxParallelWasmOptions {
    bindings: string | string[];
    bindingsFile?: string;
    threads?: number | string;
}

export class OrxParallelWasmPlugin {
    constructor(options: OrxParallelWasmOptions);
    apply(compiler: unknown): void;
}

export function orxParallelWasm(options: OrxParallelWasmOptions): OrxParallelWasmPlugin;
export default orxParallelWasm;
