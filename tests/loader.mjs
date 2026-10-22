// A tiny module loader so the tests can import the app's code as it is.
//
// What it does:
//  - lets "./registration" find "registration.ts" (the app leaves out file
//    extensions, as Next.js does; plain Node does not allow that);
//  - understands the "@/..." shortcut used in the app;
//  - turns .tsx page components into plain JavaScript using the TypeScript
//    package that is already installed;
//  - swaps four Next.js-only modules for small stand-ins (tests/stubs), so
//    cookies, redirects, links and request-time waiting can be tested without
//    a running website.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = {
  "next/link": "stubs/next-link.mjs",
  "next/headers": "stubs/next-headers.mjs",
  "next/navigation": "stubs/next-navigation.mjs",
  "next/server": "stubs/next-server.mjs",
};

function findFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of [".ts", ".tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    const file = path.join(root, "tests", STUBS[specifier]);
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const file = findFile(path.join(root, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && context.parentURL?.startsWith("file:")) {
    const parent = fileURLToPath(context.parentURL);
    if (!parent.includes(`${path.sep}node_modules${path.sep}`)) {
      const file = findFile(path.resolve(path.dirname(parent), specifier));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".tsx")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
