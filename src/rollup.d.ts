/** Minimal typings for the Rollup plugin exported by the package. */

export interface OrxParallelWasmOptions {
    bindings: string | string[];
    bindingsFile?: string;
    threads?: number | string;
}

export interface RollupPluginLike {
    name: string;
    buildStart?: () => Promise<void>;
    generateBundle?: () => Promise<void>;
}

export interface PreparedCrate {
    crateName: string;
    outDir: string;
    manifest: { bindingsUrl: string; workerHelpers: string[]; threads: number };
}

export function emitCrate(pluginContext: unknown, crate: PreparedCrate, isPrimary: boolean): Promise<void>;
export function orxParallelWasm(options: OrxParallelWasmOptions): RollupPluginLike;
export default orxParallelWasm;
