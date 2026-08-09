# Publishing

## Prerequisites

- Node.js 20 or later
- A Visual Studio Marketplace publisher
- Permission to publish extensions under that publisher
- An Azure DevOps test organization

The manifest uses `promicro` as the publisher ID. If the actual Marketplace publisher ID differs, update `publisher` in `vss-extension.json` before packaging. The publisher ID is part of the permanent extension identity.

## Validate and package

```text
corepack enable
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm run package:vsix
```

Upload the versioned VSIX from `dist` (currently `promicro.parent-field-sync-1.0.2.vsix`) in the Visual Studio Marketplace publishing portal. New extensions are private by default. Share the private extension with a test organization, install it, and verify both dry-run and update behavior before making it public. A public listing requires a verified publisher.

The production manifest is currently marked `Public` and `Preview`. Keep `Preview` for an initial public release; remove it in a future version when the extension is ready to be presented as generally available.

## Marketplace checklist

- Confirm the publisher ID, repository URLs, support URL, privacy policy, and license.
- Confirm the linked README, configuration guide, privacy policy, and license are available on the repository's default branch.
- Confirm the generated icon is owned and approved for use.
- Review the generated task bundle's `THIRD-PARTY-NOTICES.txt`.
- Review `docs/marketplace.md` as the listing overview.
- Confirm packaging reports that the Marketplace icon, overview, and license assets were validated.
- Validate new versions privately before publishing them broadly.
- Confirm `Public` is present in `galleryFlags`, and retain or remove `Preview` intentionally.
- Increment `vss-extension.json` for every Marketplace upload.
- Increment `tasks/ParentFieldSync/task.json` whenever the task implementation or metadata changes.
- Use a new task major version only for breaking YAML input or behavior changes.
- Test the VSIX on all supported agent operating systems before a public release.

The repository CI pipeline performs type checking, unit tests, task bundling, VSIX creation, and artifact publication. Marketplace upload remains an intentional release action so a repository build cannot publish without review.
