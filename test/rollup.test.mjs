import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emitCrate } from "../src/rollup.js";
// dist is used here because the runtime worker is a built sibling of rollup.js
import { emitRuntimeWorker } from "../dist/rollup.js";

function fakePluginContext() {
    const assets = new Map();
    return { assets, emitFile: ({ fileName, source }) => assets.set(fileName, source) };
}

test("Rollup plugin emits the runtime worker next to each entry chunk", async () => {
    const context = fakePluginContext();
    await emitRuntimeWorker(context, {
        "assets/main.js": { type: "chunk", isEntry: true, fileName: "assets/main.js" },
        "assets/vendor.js": { type: "chunk", isEntry: false, fileName: "assets/vendor.js" },
        "index.html": { type: "asset", fileName: "index.html" }
    });

    assert.deepEqual([...context.assets.keys()], ["assets/worker.js"]);
    assert.match(context.assets.get("assets/worker.js"), /init_wasm_parallel_runtime/);
});

test("Rollup plugin rewrites the wasm-pack placeholder import and emits assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "orx-parallel-wasm-rollup-"));
    const outDir = join(root, "pkg");
    const snippetDir = join(outDir, "snippets", "orx-parallel-abc", "src", "pool", "pool_impl");
    await mkdir(snippetDir, { recursive: true });
    await writeFile(join(outDir, "wasm_bindings.js"), "export default async () => {};\n");
    await writeFile(join(snippetDir, "wasm_web_start_workers.js"), `const pkg = await import("../../../../..");`);

    const crate = {
        crateName: "wasm_bindings",
        outDir,
        manifest: { bindingsUrl: "./wasm_bindings.js", workerHelpers: [], threads: 0 }
    };

    const context = fakePluginContext();
    await emitCrate(context, crate, true);

    assert.ok(context.assets.has("assets/bindings.js"));
    assert.match(context.assets.get("assets/bindings.js"), /wasm_bindings\.generated\.js/);
    assert.ok(context.assets.has("assets/wasm_bindings.generated.js"));

    const snippetOut = context.assets.get("assets/snippets/orx-parallel-abc/src/pool/pool_impl/wasm_web_start_workers.js");
    assert.ok(snippetOut, "snippet asset should be emitted");
    assert.match(snippetOut.toString(), /import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/wasm_bindings\.generated\.js"\)/);
});

test("Rollup plugin skips the crate-name shim when it collides with the real entry file", async () => {
    const root = await mkdtemp(join(tmpdir(), "orx-parallel-wasm-rollup-"));
    const outDir = join(root, "pkg");
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "wasm_bindings.js"), "export default async () => {};\n");

    const crate = {
        crateName: "wasm_bindings",
        outDir,
        manifest: { bindingsUrl: "./wasm_bindings.js", workerHelpers: [], threads: 0 }
    };

    const context = fakePluginContext();
    await emitCrate(context, crate, true);

    assert.ok(context.assets.has("assets/wasm_bindings.js"));
    assert.ok(context.assets.has("assets/bindings.js"));
    assert.equal(context.assets.get("assets/wasm_bindings.js").toString(), "export default async () => {};\n");
    assert.match(context.assets.get("assets/bindings.js").toString(), /wasm_bindings\.generated\.js/);
    assert.equal(context.assets.get("assets/wasm_bindings.generated.js").toString(), "export default async () => {};\n");
});

