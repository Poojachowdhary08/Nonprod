#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");
const iconsDir = path.join(publicDir, "icons");
const assetsDir = path.join(projectRoot, "assets", "images");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyRecursive(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
    } else {
      copyFile(sourcePath, targetPath);
    }
  }
}

function injectWebAppTags(html) {
  const tags = [
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
    '<meta name="theme-color" content="#1d4ed8">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<meta name="apple-mobile-web-app-title" content="AvenueConnect">',
  ];

  if (!html.includes("</head>")) return html;

  let nextHtml = html;
  for (const tag of tags) {
    if (!nextHtml.includes(tag)) {
      nextHtml = nextHtml.replace("</head>", `${tag}</head>`);
    }
  }
  return nextHtml;
}

function patchExportedHtmlFiles() {
  if (!fs.existsSync(distDir)) return;
  const htmlFiles = fs.readdirSync(distDir).filter((name) => name.endsWith(".html"));
  for (const fileName of htmlFiles) {
    const fullPath = path.join(distDir, fileName);
    const original = fs.readFileSync(fullPath, "utf8");
    const patched = injectWebAppTags(original);
    if (patched !== original) {
      fs.writeFileSync(fullPath, patched, "utf8");
    }
  }
}

function main() {
  ensureDir(iconsDir);

  const icon192Source = path.join(assetsDir, "icon.png");
  const icon512Source = path.join(assetsDir, "adaptive-icon.png");
  const appleTouchIconSource = path.join(assetsDir, "icon.png");

  if (fs.existsSync(icon192Source)) {
    copyFile(icon192Source, path.join(iconsDir, "icon-192.png"));
  }
  if (fs.existsSync(icon512Source)) {
    copyFile(icon512Source, path.join(iconsDir, "icon-512.png"));
  }
  if (fs.existsSync(appleTouchIconSource)) {
    copyFile(appleTouchIconSource, path.join(iconsDir, "apple-touch-icon.png"));
  }

  copyRecursive(publicDir, distDir);
  patchExportedHtmlFiles();
  console.log("[web-static] copied public assets into dist");
}

main();
