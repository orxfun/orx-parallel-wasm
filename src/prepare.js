import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Normalize and validate thread configuration.
 * Accepts number or numeric string, requires non-negative integer.
 *
 * @param {number | string | undefined} value
 * @returns {number}
 */
export function normalizeThreads(value) {
    const normalized = value === undefined ? 0 : Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
        throw new Error("threads must be a non-negative integer");
    }
    return normalized;
}

/**
 * Prepare a wasm-pack package directory for consumption by a browser bundler.
 * Copies the generated worker helper next to each worker entry and writes a
 * manifest describing the package's browser-facing assets.
 *
 * @param {{outDir: string, bindingsFile?: string, threads?: number | string}} options
 * @returns {Promise<{bindingsUrl: string, workerHelpers: string[], threads: number}>}
 */
export async function prepareWasm({ outDir, bindingsFile, threads }) {
    const outputDir = resolve(outDir);
    const normalizedThreads = normalizeThreads(threads);
    const entry = bindingsFile ?? await readFile(join(outputDir, "package.json"), "utf8")
        .then(text => JSON.parse(text).main)
        .catch(() => undefined)
        ?? "wasm_bindings.js";
    const snippetRoot = join(outputDir, "snippets");
    const workerSources = (await findFiles(snippetRoot, "wasm_web_start_workers.js"))
        .sort((left, right) => left.localeCompare(right));

    if (workerSources.length === 0) {
        throw new Error(`no wasm_web_start_workers.js found under ${snippetRoot}`);
    }

    for (const source of workerSources) {
        const destination = join(dirname(source), "worker_helpers.js");
        await cp(source, destination);
    }

    const manifest = {
        bindingsUrl: `./${entry.replaceAll("\\", "/").replace(/^\.\//, "")}`,
        workerHelpers: workerSources.map((source) =>
            relative(outputDir, join(dirname(source), "worker_helpers.js"))
                .replaceAll("\\", "/")
        ),
        threads: normalizedThreads
    };
    await writeFile(join(outputDir, "orx-parallel-wasm.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

/**
 * Recursively find files with the given filename under a directory.
 * Returns absolute paths in filesystem order; callers should sort when order
 * is part of an output contract.
 *
 * @param {string} directory
 * @param {string} filename
 * @returns {Promise<string[]>}
 */
async function findFiles(directory, filename) {
    const matches = [];
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return matches;
        throw error;
    }

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            matches.push(...await findFiles(path, filename));
        } else if (entry.isFile() && entry.name === filename) {
            matches.push(path);
        }
    }
    return matches;
}