import { copyFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const outputDirectory = path.join(root, "build", "ParentFieldSync");
const ncc = path.join(root, "node_modules", "@vercel", "ncc", "dist", "ncc", "cli.js");

await rm(path.join(root, "build"), { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    ncc,
    "build",
    path.join("tasks", "ParentFieldSync", "src", "index.ts"),
    "--out",
    outputDirectory,
    "--minify",
    "--source-map",
    "--license",
    "THIRD-PARTY-NOTICES.txt"
  ],
  { cwd: root, stdio: "inherit", shell: false }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

await copyFile(
  path.join(root, "tasks", "ParentFieldSync", "task.json"),
  path.join(outputDirectory, "task.json")
);
await copyFile(
  path.join(root, "tasks", "ParentFieldSync", "icon.png"),
  path.join(outputDirectory, "icon.png")
);

console.log(`Prepared task package at ${outputDirectory}`);
