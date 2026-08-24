import { readFile } from "node:fs/promises";
import { basename as pathBasename, relative, resolve as pathResolve } from "node:path";
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
 * Webpack plugin that builds a Rust `wasm-pack` crate, prepares the generated
 * package, and emits the resulting assets (plus `_headers` and a stable
 * `bindings.js` entry shim) into the compilation output.
 *
 * Options mirror `orx-parallel-wasm/vite`: `bindings` (string | string[],
 * required), `bindingsFile` (string, optional), `threads` (number, optional).
 */
export class OrxParallelWasmPlugin {
    constructor(options) {
        if (options?.bindings === undefined) {
            throw new Error(
                "`bindings` is required: a path or array of paths to Rust crate directory(ies) (each with Cargo.toml) that `wasm-pack` will build."
            );
        }
        this.bindingsList = Array.isArray(options.bindings) ? options.bindings : [options.bindings];
        if (this.bindingsList.length === 0) {
            throw new Error("`bindings` must be a non-empty string or array of crate paths.");
        }
        this.bindingsFile = options.bindingsFile;
        this.threads = options.threads;
        this.crates = [];
        this.buildPromise = undefined;
    }

    apply(compiler) {
        const { webpack } = compiler;
        const { RawSource } = webpack.sources;

        compiler.options.devServer = {
            ...compiler.options.devServer,
            headers: {
                ...compiler.options.devServer?.headers,
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp"
            }
        };

        const ensureBuilt = () => this.build(compiler.options.context ?? process.cwd());
        compiler.hooks.beforeRun.tapPromise("OrxParallelWasm", ensureBuilt);
        compiler.hooks.watchRun.tapPromise("OrxParallelWasm", ensureBuilt);

        compiler.hooks.thisCompilation.tap("OrxParallelWasm", (compilation) => {
            compilation.hooks.processAssets.tapPromise(
                {
                    name: "OrxParallelWasm",
                    stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
                },
                async () => {
                    await ensureBuilt();
                    for (const crate of this.crates) {
                        await this.emitCrate(compilation, RawSource, crate);
                    }
                    compilation.emitAsset("_headers", new RawSource(HEADERS_FILE));
                }
            );
        });
    }

    build(context) {
        this.buildPromise ??= (async () => {
            for (const bindingPath of this.bindingsList) {
                const crateName = pathBasename(String(bindingPath)).replace(/[^A-Za-z0-9_-]/g, "_");
                const outDir = this.bindingsList.length === 1
                    ? pathResolve(context, "pkg")
                    : pathResolve(context, "pkg", crateName);
                const manifest = await buildWasm({
                    bindings: pathResolve(context, String(bindingPath)),
                    outDir,
                    bindingsFile: this.bindingsFile,
                    threads: this.threads
                });
                this.crates.push({ crateName, outDir, manifest });
            }
        })();
        return this.buildPromise;
    }

    async emitCrate(compilation, RawSource, crate) {
        const { outDir, manifest, crateName } = crate;
        const entryFile = manifest.bindingsUrl.replace(/^\.\//, "");
        const runtimeEntry = `${crateName}.generated.js`;
        const isPrimary = this.crates[0] === crate;

        for (const file of await listFiles(outDir)) {
            const relPath = relative(outDir, file).replaceAll("\\", "/");
            const depth = relPath.split("/").length - 1;
            let content = await readFile(file);
            if (relPath.startsWith("snippets/") && file.endsWith(".js")) {
                const replacement = `import("${"../".repeat(depth)}${runtimeEntry}")`;
                let text = content.toString("utf8");
                for (const placeholder of PLACEHOLDER_IMPORTS) {
                    text = text.split(placeholder).join(replacement);
                }
                content = text;
            }
            compilation.emitAsset(`assets/${relPath}`, new RawSource(content));
        }

        const entryContent = await readFile(pathResolve(outDir, entryFile));
        compilation.emitAsset(`assets/${runtimeEntry}`, new RawSource(entryContent));

        const shim = `export * from './${runtimeEntry}';\nexport { default } from './${runtimeEntry}';\n`;
        if (`${crateName}.js` !== entryFile) {
            compilation.emitAsset(`assets/${crateName}.js`, new RawSource(shim));
        }
        if (isPrimary) {
            compilation.emitAsset("assets/bindings.js", new RawSource(shim));
        }
    }
}

/** Factory mirroring `orx-parallel-wasm/vite`'s exported function shape. */
export function orxParallelWasm(options) {
    return new OrxParallelWasmPlugin(options);
}

export default orxParallelWasm;
