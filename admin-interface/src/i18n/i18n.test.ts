import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import en from "./en.json";
import zh from "./zh.json";

interface LocaleTree {
  [key: string]: string | LocaleTree;
}

const flattenKeys = (tree: LocaleTree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value, next);
    }
    return [next];
  });

const walkSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(fullPath);
    return /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith(".test.ts")
      ? [fullPath]
      : [];
  });

describe("admin-interface i18n dictionaries", () => {
  it("keeps English and Chinese flattened key coverage identical", () => {
    expect(flattenKeys(zh).sort()).toEqual(flattenKeys(en).sort());
  });

  it("defines every literal i18n key used by source files", () => {
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const localeKeys = new Set(flattenKeys(en));
    const missing = new Set<string>();
    const literalKeyPattern = /\$_?\(\s*["'`]([^"'`$]+)["'`]/g;

    for (const file of walkSourceFiles(sourceRoot)) {
      const contents = fs.readFileSync(file, "utf8");
      for (const match of contents.matchAll(literalKeyPattern)) {
        if (!localeKeys.has(match[1])) {
          missing.add(`${match[1]} (${path.relative(sourceRoot, file)})`);
        }
      }
    }

    expect([...missing].sort()).toEqual([]);
  });
});
