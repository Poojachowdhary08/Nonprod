const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "components"]; // add "src" if you have it
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir, out = []) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

function patchFile(file) {
  const before = fs.readFileSync(file, "utf8");
  let s = before;

  // Replace JSX tags Text -> TText
  s = s.replace(/<Text(\s|>)/g, "<TText$1");
  s = s.replace(/<\/Text>/g, "</TText>");

  // If no changes, skip
  if (s === before) return false;

  // Ensure import of TText exists
  if (!s.includes(`from "@/components/TText"`)) {
    // Add TText import near top (after react imports)
    const lines = s.split("\n");
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import")) insertAt = i + 1;
      else break;
    }
    lines.splice(insertAt, 0, `import TText from "@/components/TText";`);
    s = lines.join("\n");
  }

  // Remove Text from react-native import if present
  s = s.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']react-native["'];?/g,
    (match, inner) => {
      const parts = inner
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => x !== "Text");
      return `import { ${parts.join(", ")} } from "react-native";`;
    }
  );

  fs.writeFileSync(file, s, "utf8");
  return true;
}

let changed = 0;

for (const d of TARGET_DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  const files = walk(full);
  for (const f of files) {
    if (patchFile(f)) changed++;
  }
}

console.log(`✅ Done. Updated files: ${changed}`);
