#!/usr/bin/env bun
/**
 * Syncs the version from package.json to README.md
 * Run with: bun run sync-version
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const rootDir = join(import.meta.dir, "..");
const packageJsonPath = join(rootDir, "package.json");
const readmePath = join(rootDir, "README.md");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;
const packageName = packageJson.name;

let readme = readFileSync(readmePath, "utf-8");

// Match @mathew-cf/opencode-blueprint@X.Y.Z pattern
const versionPattern = new RegExp(
  `${packageName.replace("/", "\\/")}@\\d+\\.\\d+\\.\\d+`,
  "g"
);

const newVersionString = `${packageName}@${version}`;
const updatedReadme = readme.replace(versionPattern, newVersionString);

if (readme !== updatedReadme) {
  writeFileSync(readmePath, updatedReadme);
  console.log(`Updated README.md to version ${version}`);
} else {
  console.log(`README.md already at version ${version}`);
}
