import { access, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
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

const tfxPackagePath = await realpath(
  path.join(root, "node_modules", "tfx-cli", "package.json")
);
const requireFromTfx = createRequire(tfxPackagePath);
const JSZip = requireFromTfx("jszip");
const archive = await JSZip.loadAsync(await readFile(outputPath));
const packagedManifest = archive.file("extension.vsixmanifest");

if (!packagedManifest) {
  throw new Error("The generated VSIX does not contain extension.vsixmanifest.");
}

const packagedManifestXml = await packagedManifest.async("string");
const galleryFlags = packagedManifestXml.match(/<GalleryFlags>([^<]+)<\/GalleryFlags>/u)?.[1];

if (!galleryFlags?.split(/\s+/u).includes("Public")) {
  throw new Error("The generated VSIX is not marked Public in extension.vsixmanifest.");
}

const assetEntries = [...packagedManifestXml.matchAll(/<Asset\s+([^>]+)\/>/gu)].map(
  (match) => match[1] ?? ""
);
const requiredMarketplaceAssets = [
  {
    type: "Microsoft.VisualStudio.Services.Icons.Default",
    path: "images/extension-icon.png"
  },
  {
    type: "Microsoft.VisualStudio.Services.Content.Details",
    path: "docs/marketplace.md"
  },
  {
    type: "Microsoft.VisualStudio.Services.Content.License",
    path: "LICENSE"
  }
];

for (const asset of requiredMarketplaceAssets) {
  const registered = assetEntries.some(
    (entry) =>
      entry.includes(`Type="${asset.type}"`) && entry.includes(`Path="${asset.path}"`)
  );

  if (!registered) {
    throw new Error(
      `The generated VSIX is missing Marketplace asset '${asset.type}' at '${asset.path}'.`
    );
  }
}

console.log("Validated public visibility and Marketplace icon, overview, and license assets.");
console.log(`Created ${outputPath}`);
