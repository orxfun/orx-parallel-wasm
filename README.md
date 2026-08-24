# orx-parallel-wasm

This package provides a typed browser worker client for wasm bindings built
with `wasm-pack` and the web-thread backend of `orx-parallel`.

## Runtime

```ts
import { ParallelWorker } from "orx-parallel-wasm";

type Computations = {
    compute: (input: number, threads: number) => bigint;
};

const worker = new ParallelWorker<Computations>({
    bindingsUrl,
    methods: ["compute"],
    threads: 0
});

const result = await worker.call("compute", [input, threads]);
worker.terminate();
```

The worker imports the bindings module, awaits its generated default wasm
initializer, awaits `init_wasm_parallel_runtime(threads)`, and then dispatches only
the methods listed in `methods`. Calls on one client are serialized.

## Build preparation

The preparation API is bundler-neutral. It can be used from a Webpack,
Rollup, or other build script independently of the Vite integration.

`prepare` processes an existing `wasm-pack` output directory:

```bash
node node_modules/orx-parallel-wasm/dist/build.js prepare
```

`build` invokes `wasm-pack` and then performs the same preparation:

```bash
ORX_PARALLEL_WASM_BINDINGS=./wasm_bindings \
ORX_PARALLEL_WASM_OUT_DIR=./app/pkg \
node node_modules/orx-parallel-wasm/dist/build.js build
```

Both modes copy the generated `wasm_web_start_workers.js` files to the
adjacent `worker_helpers.js` paths and write `orx-parallel-wasm.json`. The
build-time thread limit comes from the `threads` option of the Vite plugin (or
of `buildWasm`/`prepareWasm`); `0`, the default, leaves browser
hardware-concurrency selection to the client.

Use `prepareWasm` when the Rust package has already been built, or
`buildWasm` when the build should invoke `wasm-pack`. The resulting directory
can then be emitted as static assets by the bundler of your choice.

The preparation-only API is also available from `orx-parallel-wasm/prepare`.

The Vite integration is available from `orx-parallel-wasm/vite` and adds the
cross-origin isolation headers required by `SharedArrayBuffer`.
