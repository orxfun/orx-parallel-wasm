import assert from "node:assert/strict";
import test from "node:test";
import { OrxParallelWasmPlugin, orxParallelWasm } from "../src/rspack.js";
import { OrxParallelWasmPlugin as WebpackPlugin } from "../src/webpack.js";

class FakePromiseHook {
    constructor() { this.taps = []; }
    tapPromise(_name, fn) { this.taps.push(fn); }
}

test("Rspack plugin re-exports the same implementation as the Webpack plugin", () => {
    assert.equal(OrxParallelWasmPlugin, WebpackPlugin);
    assert.equal(typeof orxParallelWasm, "function");
});

test("Rspack plugin merges devServer headers when compiler.rspack is set", () => {
    // compiler.rspack is the documented way to distinguish Rspack from webpack at runtime;
    // our plugin must not special-case it away.
    const compiler = {
        rspack: {},
        webpack: { sources: {}, Compilation: {} },
        options: {},
        hooks: {
            beforeRun: new FakePromiseHook(),
            watchRun: new FakePromiseHook(),
            thisCompilation: { tap: () => undefined }
        }
    };

    const plugin = orxParallelWasm({ bindings: "../wasm_bindings" });
    plugin.apply(compiler);

    assert.equal(compiler.options.devServer.headers["Cross-Origin-Opener-Policy"], "same-origin");
    assert.equal(compiler.options.devServer.headers["Cross-Origin-Embedder-Policy"], "require-corp");
});
