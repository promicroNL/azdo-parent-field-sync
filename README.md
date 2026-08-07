# Parent Field Sync

Parent Field Sync is a publishable Azure DevOps extension that adds a cross-platform Azure Pipelines task for copying selected Azure Boards fields from parent work items to their children.

The task uses the pipeline job token, calls only the Azure DevOps organization where the pipeline runs, batches reads, and combines all field changes for a child into one revision-checked update.

## Quick start

1. Install the extension into your Azure DevOps organization.
2. Make sure the project's build service identity can view and edit work items.
3. Add a scheduled pipeline with the task:

```yaml
trigger: none
pr: none

schedules:
- cron: "*/30 * * * *"
  displayName: Synchronize every 30 minutes
  branches:
    include:
    - main
  always: true

pool:
  vmImage: ubuntu-latest

steps:
- checkout: none

- task: ParentFieldSync@1
  inputs:
    parentWorkItemType: User Story
    childWorkItemType: Task
    fieldMappings: |
      Custom.Process
      Custom.Customer=Custom.ChildCustomer
      System.Tags
```

Use `Source.ReferenceName` when the same field exists on both types. Use `Source.ReferenceName=Target.ReferenceName` to copy to a differently named child field.

## Behavior

- Only direct parent links (`System.LinkTypes.Hierarchy-Reverse`) are considered.
- Only parents with the configured parent work item type are used.
- Strings, picklists, numbers, booleans, dates, GUIDs, and `System.Tags` are supported.
- Empty parent values clear child values by default.
- Children without a parent have mapped values cleared by default.
- `dryRun: true` reports intended changes without writing them.
- Multiple mappings are applied to each child in one JSON Patch request guarded by the child's revision.

See [configuration](docs/configuration.md), [publishing](docs/publishing.md), and the full [scheduled pipeline example](examples/scheduled-sync.yml).

## Development

Requirements: Node.js 20 or later and Corepack (included with Node.js 20).

```text
corepack enable
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm run package:vsix
```

The VSIX is written to `dist/`. Generated build output and packages are intentionally excluded from source control.

The manifest currently uses the Marketplace publisher ID `promicro`, matching this repository's organization. Change `publisher` in `vss-extension.json` before packaging if your Marketplace publisher ID differs.

## Security and privacy

The task does not collect telemetry or send data to third parties. It receives the Azure Pipelines job token through the built-in `SystemVssConnection`, masks it, and uses it only for Azure DevOps Work Item Tracking REST calls. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
