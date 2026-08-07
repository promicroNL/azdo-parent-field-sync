import { access, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "vss-extension.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const taskEntryPoint = path.join(root, "build", "ParentFieldSync", "index.js");

try {
  await access(taskEntryPoint);
} catch {
  throw new Error("The packaged task is missing. Run the build script before packaging the VSIX.");
}

const outputDirectory = path.join(root, "dist");
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(
  outputDirectory,
  `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`
);
await rm(outputPath, { force: true });
const tfx = path.join(root, "node_modules", "tfx-cli", "_build", "tfx-cli.js");
const result = spawnSync(
  process.execPath,
  [
    tfx,
    "extension",
    "create",
    "--manifest-globs",
    "vss-extension.json",
    "--output-path",
    outputPath
  ],
  { cwd: root, stdio: "inherit", shell: false }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Created ${outputPath}`);
