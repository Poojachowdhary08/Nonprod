#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = process.cwd();
const expoCli = require.resolve("expo/bin/cli", { paths: [projectRoot] });
const rawArgs = process.argv.slice(2);

const heapSnapshotPatterns = [
  "--heapsnapshot-near-heap-limit",
  "--heapsnapshot-signal",
];

function splitNodeOptions(value) {
  if (!value) return [];
  return value.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
}

function sanitizeNodeOptions(value) {
  const tokens = splitNodeOptions(value);
  const kept = [];
  const removed = [];

  for (const token of tokens) {
    const normalized = token.replace(/^"+|"+$/g, "");
    const shouldRemove = heapSnapshotPatterns.some(
      (flag) => normalized === flag || normalized.startsWith(`${flag}=`)
    );

    if (shouldRemove) {
      removed.push(normalized);
    } else {
      kept.push(token);
    }
  }

  return {
    original: value || "",
    sanitized: kept.join(" "),
    removed,
  };
}

function readHeapSnapshots(cwd) {
  const names = fs
    .readdirSync(cwd)
    .filter((name) => /^Heap\.\d{8}\.\d+\.\d+\.\d+\.\d+\.heapsnapshot$/.test(name))
    .sort();

  return names.map((name) => {
    const fullPath = path.join(cwd, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      fullPath,
      size: stats.size,
    };
  });
}

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

function logSnapshotSummary() {
  const snapshots = readHeapSnapshots(projectRoot);
  if (snapshots.length === 0) return;

  console.log("[heap-debug] found heap snapshot files in project root:");
  for (const snapshot of snapshots) {
    const quality = snapshot.size === 0 ? "empty" : "captured";
    console.log(
      `[heap-debug]   ${snapshot.name} (${formatBytes(snapshot.size)}, ${quality})`
    );
  }
}

function main() {
  if (rawArgs.length === 0) {
    console.error("[heap-debug] missing Expo CLI command");
    process.exit(1);
  }

  const nodeOptions = sanitizeNodeOptions(process.env.NODE_OPTIONS || "");
  const env = { ...process.env };

  if (nodeOptions.sanitized) {
    env.NODE_OPTIONS = nodeOptions.sanitized;
  } else {
    delete env.NODE_OPTIONS;
  }

  logSnapshotSummary();

  if (nodeOptions.removed.length > 0) {
    console.warn(
      `[heap-debug] removed snapshot-related NODE_OPTIONS before starting Expo: ${nodeOptions.removed.join(
        ", "
      )}`
    );
  } else {
    console.log("[heap-debug] no snapshot-related NODE_OPTIONS found");
  }

  const child = spawn(process.execPath, [expoCli, ...rawArgs], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
