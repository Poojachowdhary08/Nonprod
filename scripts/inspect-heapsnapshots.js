#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const cwd = process.cwd();

function formatBytes(size) {
  if (size === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const snapshotNames = fs
  .readdirSync(cwd)
  .filter((name) => /^Heap\.\d{8}\.\d+\.\d+\.\d+\.\d+\.heapsnapshot$/.test(name))
  .sort();

if (snapshotNames.length === 0) {
  console.log("No Heap.*.heapsnapshot files found in project root.");
  process.exit(0);
}

console.log("Heap snapshot files:");

for (const name of snapshotNames) {
  const fullPath = path.join(cwd, name);
  const stats = fs.statSync(fullPath);
  const verdict =
    stats.size === 0
      ? "empty placeholder; not useful for memory or crash diagnosis"
      : "contains heap data; useful for memory analysis, not crash reasons";

  console.log(`- ${name}`);
  console.log(`  size: ${formatBytes(stats.size)}`);
  console.log(`  verdict: ${verdict}`);
}
