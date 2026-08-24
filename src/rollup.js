import { readFile } from "node:fs/promises";
import { basename as pathBasename, relative, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWasm } from "./build.js";
import { listFiles } from "./prepare.js";

const HEADERS_FILE = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/assets/*.wasm
  Content-Type: application/wasm
`;

// wasm-pack's worker snippets import the package entry through this placeholder;
// only the entry filename is bundler-specific, so it is resolved from the build manifest.
const PLACEHOLDER_IMPORTS = [`import("../../../../..")`, `import('../../../../..')`];

/**
 * Rollup plugin that builds a Rust `wasm-pack` crate, prepares the generated
 * package, and emits the resulting assets (plus `_headers` and a stable
 * `bindings.js` entry shim) into the Rollup output.
 *
 * Options mirror `orx-parallel-wasm/vite` and `orx-parallel-wasm/webpack`:
 * `bindings` (string | string[], required), `bindingsFile` (string, optional),
 * `threads` (number, optional).
 */
export function orxParallelWasm(options) {
    if (options?.bindings === undefined) {
        throw new Error(
            "`bindings` is required: a path or array of paths to Rust crate directory(ies) (each with Cargo.toml) that `wasm-pack` will build."
        );
    }
    const bindingsList = Array.isArray(options.bindings) ? options.bindings : [options.bindings];
    if (bindingsList.length === 0) {
        throw new Error("`bindings` must be a non-empty string or array of crate paths.");
    }
    const bindingsFile = options.bindingsFile;
    const threads = options.threads;
    const crates = [];
    let buildPromise;

    function ensureBuilt() {
        buildPromise ??= (async () => {
            const context = process.cwd();
            for (const bindingPath of bindingsList) {
                const crateName = pathBasename(String(bindingPath)).replace(/[^A-Za-z0-9_-]/g, "_");
                const outDir = bindingsList.length === 1
                    ? pathResolve(context, "pkg")
                    : pathResolve(context, "pkg", crateName);
                const manifest = await buildWasm({
                    bindings: pathResolve(context, String(bindingPath)),
                    outDir,
                    bindingsFile,
                    threads
                });
                crates.push({ crateName, outDir, manifest });
            }
        })();
        return buildPromise;
    }

    return {
        name: "orx-parallel-wasm",
        async buildStart() {
            await ensureBuilt();
        },
        async generateBundle(_outputOptions, bundle) {
            await ensureBuilt();
            for (const crate of crates) {
                await emitCrate(this, crate, crates[0] === crate);
            }
            await emitRuntimeWorker(this, bundle);
            this.emitFile({ type: "asset", fileName: "_headers", source: HEADERS_FILE });
        }
    };
}

/**
 * Emit the client's runtime worker next to every entry chunk.
 *
 * Rollup, unlike Vite/webpack/Rspack, does not turn `new URL("./worker.js",
 * import.meta.url)` into an emitted asset, so the reference would otherwise 404.
 */
export async function emitRuntimeWorker(pluginContext, bundle) {
    const source = await readFile(fileURLToPath(new URL("./worker.js", import.meta.url)), "utf8");
    const directories = new Set();

    for (const output of Object.values(bundle ?? {})) {
        if (output.type !== "chunk" || !output.isEntry) continue;
        const separator = output.fileName.lastIndexOf("/");
        directories.add(separator === -1 ? "" : output.fileName.slice(0, separator + 1));
    }

    for (const directory of directories) {
        pluginContext.emitFile({ type: "asset", fileName: `${directory}worker.js`, source });
    }
}

export async function emitCrate(pluginContext, crate, isPrimary) {
    const { outDir, manifest, crateName } = crate;
    const entryFile = manifest.bindingsUrl.replace(/^\.\//, "");

    for (const file of await listFiles(outDir)) {
        const relPath = relative(outDir, file).replaceAll("\\", "/");
        const depth = relPath.split("/").length - 1;
        let content = await readFile(file);
        if (relPath.startsWith("snippets/") && file.endsWith(".js")) {
            const replacement = `import("${"../".repeat(depth)}${entryFile}")`;
            let text = content.toString("utf8");
            for (const placeholder of PLACEHOLDER_IMPORTS) {
                text = text.split(placeholder).join(replacement);
            }
            content = text;
        }
        pluginContext.emitFile({ type: "asset", fileName: `assets/${relPath}`, source: content });
    }

    const shim = `export * from './${entryFile}';\nexport { default } from './${entryFile}';\n`;
    if (`${crateName}.js` !== entryFile) {
        pluginContext.emitFile({ type: "asset", fileName: `assets/${crateName}.js`, source: shim });
    }
    if (isPrimary && "bindings.js" !== entryFile) {
        pluginContext.emitFile({ type: "asset", fileName: "assets/bindings.js", source: shim });
    }
}

export default orxParallelWasm;
