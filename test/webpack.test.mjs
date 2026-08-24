import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { OrxParallelWasmPlugin } from "../src/webpack.js";

class FakeSyncHook {
    constructor() { this.taps = []; }
    tap(_name, fn) { this.taps.push(fn); }
}
class FakePromiseHook {
    constructor() { this.taps = []; }
    tapPromise(_name, fn) { this.taps.push(fn); }
    async callAll(...args) {
        for (const fn of this.taps) await fn(...args);
    }
}

function fakeCompiler(context) {
    const processAssets = new FakePromiseHook();
    const assets = new Map();
    const compilation = {
        hooks: { processAssets },
        emitAsset: (name, source) => assets.set(name, source.source())
    };
    const thisCompilation = new FakeSyncHook();
    thisCompilation.tap = (_name, fn) => fn(compilation);

    const compiler = {
        webpack: {
            sources: { RawSource: class { constructor(v) { this.value = v; } source() { return this.value; } } },
            Compilation: { PROCESS_ASSETS_STAGE_ADDITIONAL: 1 }
        },
        options: { context },
        hooks: {
            beforeRun: new FakePromiseHook(),
            watchRun: new FakePromiseHook(),
            thisCompilation
        }
    };
    return { compiler, processAssets, assets };
}

test("Webpack plugin merges devServer cross-origin isolation headers", () => {
    const { compiler } = fakeCompiler("/example/app");
    const plugin = new OrxParallelWasmPlugin({ bindings: "../wasm_bindings" });
    plugin.apply(compiler);

    assert.equal(compiler.options.devServer.headers["Cross-Origin-Opener-Policy"], "same-origin");
    assert.equal(compiler.options.devServer.headers["Cross-Origin-Embedder-Policy"], "require-corp");
});

test("Webpack plugin rewrites the wasm-pack placeholder import and emits assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "orx-parallel-wasm-webpack-"));
    const crateDir = join(root, "wasm_bindings");
    const snippetDir = join(crateDir, "snippets", "orx-parallel-abc", "src", "pool", "pool_impl");
    await mkdir(snippetDir, { recursive: true });
    await writeFile(join(crateDir, "package.json"), JSON.stringify({ main: "wasm_bindings.js" }));
    await writeFile(join(crateDir, "wasm_bindings.js"), "export default async () => {};\nexport function init_wasm_parallel_runtime() {}\n");
    await writeFile(join(snippetDir, "wasm_web_start_workers.js"), `const pkg = await import("../../../../..");`);

    const { compiler, processAssets, assets } = fakeCompiler(root);
    const plugin = new OrxParallelWasmPlugin({ bindings: "./wasm_bindings" });
    // bypass the real wasm-pack invocation: pre-seed the build result directly
    plugin.build = async () => {
        plugin.crates = [{
            crateName: "wasm_bindings",
            outDir: crateDir,
            manifest: { bindingsUrl: "./wasm_bindings.js", workerHelpers: [], threads: 0 }
        }];
    };
    plugin.apply(compiler);

    await processAssets.callAll();

    assert.ok(assets.has("_headers"));
    assert.match(assets.get("_headers"), /Cross-Origin-Embedder-Policy: require-corp/);
    assert.ok(assets.has("assets/bindings.js"));
    assert.match(assets.get("assets/bindings.js"), /wasm_bindings\.js/);

    const snippetOut = assets.get("assets/snippets/orx-parallel-abc/src/pool/pool_impl/wasm_web_start_workers.js");
    assert.ok(snippetOut, "snippet asset should be emitted");
    assert.match(snippetOut.toString(), /import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/wasm_bindings\.js"\)/);
    assert.doesNotMatch(snippetOut.toString(), /import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.$/m);
});
