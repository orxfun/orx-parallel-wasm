import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emitCrate } from "../src/rollup.js";

function fakePluginContext() {
    const assets = new Map();
    return { assets, emitFile: ({ fileName, source }) => assets.set(fileName, source) };
}

test("Rollup plugin rewrites the wasm-pack placeholder import and emits assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "orx-parallel-wasm-rollup-"));
    const outDir = join(root, "pkg");
    const snippetDir = join(outDir, "snippets", "orx-parallel-abc", "src", "pool", "pool_impl");
    await mkdir(snippetDir, { recursive: true });
    await writeFile(join(snippetDir, "wasm_web_start_workers.js"), `const pkg = await import("../../../../..");`);

    const crate = {
        crateName: "wasm_bindings",
        outDir,
        manifest: { bindingsUrl: "./wasm_bindings.js", workerHelpers: [], threads: 0 }
    };

    const context = fakePluginContext();
    await emitCrate(context, crate, true);

    assert.ok(context.assets.has("assets/bindings.js"));
    assert.match(context.assets.get("assets/bindings.js"), /wasm_bindings\.js/);

    const snippetOut = context.assets.get("assets/snippets/orx-parallel-abc/src/pool/pool_impl/wasm_web_start_workers.js");
    assert.ok(snippetOut, "snippet asset should be emitted");
    assert.match(snippetOut.toString(), /import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/wasm_bindings\.js"\)/);
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
});

