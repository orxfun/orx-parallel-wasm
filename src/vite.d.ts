import type { Plugin } from 'vite';

/**
 * Vite plugin factory for orx-parallel-wasm.
 * Minimal typings to allow consumers to import `orx-parallel-wasm/vite`.
 */
export function orxParallelWasm(options?: any): Plugin;

export default orxParallelWasm;
