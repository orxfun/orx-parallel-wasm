/** Minimal typings for build helpers exported by the package. */

export interface BuildOptions {
    bindings: string | string[];
    outDir?: string;
    bindingsFile?: string;
}

export function buildWasm(opts: BuildOptions): Promise<void>;
export function prepareWasm(opts: { outDir?: string; bindingsFile?: string } ): Promise<void>;
