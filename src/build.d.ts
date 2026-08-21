/** Minimal typings for build helpers exported by the package. */

export interface BuildOptions {
    bindings: string | string[];
    outDir: string;
    bindingsFile?: string;
    threads?: number | string;
}

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
export function buildWasm(opts: BuildOptions): Promise<WasmPreparationManifest>;
export function prepareWasm(opts: PrepareOptions): Promise<WasmPreparationManifest>;
