# orx-parallel-wasm

This package provides a typed browser worker client for wasm bindings built
with `wasm-pack` and the web-thread backend of `orx-parallel`.

It is used by the browser examples in the
[`orx-parallel`](https://github.com/orxfun/orx-parallel) repository. The package
is not published to npm yet, so the examples currently install it directly from
GitHub.

## Examples and tutorial

The step-by-step [WebAssembly tutorial](https://github.com/orxfun/orx-parallel/tree/main/docs/wasm_tutorial/vanilla)
builds a small vanilla JavaScript and TypeScript application with Vite. It
then covers the plugin-free build, other bundlers, and other UI frameworks.

Mini examples:

- [Vanilla + Vite](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-vite)
- [Vanilla without a bundler plugin](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-manual)
- [React + Vite](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/react-vite)
- [Vanilla + Webpack](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-webpack)
- [Vanilla + Rspack](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-rspack)
- [Vanilla + Rollup](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-rollup)

The larger [TSP examples](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/tsp)
show the same architecture with Vanilla TypeScript, React, Yew, and Leptos.
They can be compared through the
[TSP example hub](https://orx-parallel-wasm-demo-tsp.pages.dev/).

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

The preparation API is bundler-neutral. It can be used from a manual build,
Webpack, Rollup, Rspack, or other build script independently of the Vite
integration.

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

Both modes prepare the generated `wasm_web_start_workers.js` files, copy them
to adjacent `worker_helpers.js` paths, and write `orx-parallel-wasm.json`. The
worker helpers initialize their own generated WASM module while reusing the
shared `WebAssembly.Memory` supplied by the parent runtime. This keeps worker
initialization reliable after bundlers split the main and worker modules.

The build-time thread limit comes from the `threads` option of the Vite plugin
or of `buildWasm`/`prepareWasm`; `0`, the default, leaves browser
hardware-concurrency selection to the client.

Use `prepareWasm` when the Rust package has already been built, or
`buildWasm` when the build should invoke `wasm-pack`. The resulting directory
can then be emitted as static assets by the bundler of your choice.

The preparation-only API is also available from `orx-parallel-wasm/prepare`.

## Bundler integrations

The package provides integrations for the most common bundlers:

- `orx-parallel-wasm/vite`
- `orx-parallel-wasm/webpack`
- `orx-parallel-wasm/rspack`
- `orx-parallel-wasm/rollup`

These adapters emit the generated bindings, WASM, and worker assets, rewrite
worker imports for the bundler's output layout, create stable entries without
colliding with the generated package entry, and add the cross-origin isolation
headers required by `SharedArrayBuffer`.

The [manual mini example](https://github.com/orxfun/orx-parallel/tree/main/examples/wasm/mini/vanilla-manual)
uses the same package without a bundler adapter. Its `build.mjs` uses the
bundler-neutral build command and its `server.mjs` serves the output with the
required headers.
