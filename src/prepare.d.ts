/** Bundler-neutral helpers */

export interface PrepareOptions {
    outDir: string;
    bindingsFile?: string;
    threads?: number | string;
}

export interface WasmPreparationManifest {
    bindingsUrl: string;
    workerHelpers: string[];
    threads: number;
}

export function normalizeThreads(value?: number | string): number;
export function prepareWasm(opts: PrepareOptions): Promise<WasmPreparationManifest>;