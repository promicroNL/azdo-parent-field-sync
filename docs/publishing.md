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

Upload `dist/promicro.parent-field-sync-1.0.0.vsix` in the Visual Studio Marketplace publishing portal. New extensions are private by default. Share the private extension with a test organization, install it, and verify both dry-run and update behavior before making it public.

## Marketplace checklist

- Confirm the publisher ID, repository URLs, support URL, privacy policy, and license.
- Confirm the generated icon is owned and approved for use.
- Review the generated task bundle's `THIRD-PARTY-NOTICES.txt`.
- Review `docs/marketplace.md` as the listing overview.
- Keep the extension private during validation.
- Add `Public` to `galleryFlags` only when the listing is approved for public release.
- Increment both `vss-extension.json` and `tasks/ParentFieldSync/task.json` for every release.
- Use a new task major version only for breaking YAML input or behavior changes.
- Test the VSIX on all supported agent operating systems before a public release.

The repository CI pipeline performs type checking, unit tests, task bundling, VSIX creation, and artifact publication. Marketplace upload remains an intentional release action so a repository build cannot publish without review.
