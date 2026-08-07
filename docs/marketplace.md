# Parent Field Sync

Keep Azure Boards child work items aligned with their parents—without managing PATs or hosting a separate service.

Parent Field Sync adds a native Azure Pipelines task that copies one or more fields from direct parent work items to selected child work item types. It is designed for scheduled synchronization of custom process fields, picklists, numbers, booleans, dates, GUIDs, and tags.

## Highlights

- Configure multiple same-name or cross-field mappings in one task.
- Run on Microsoft-hosted or self-hosted Windows, Linux, and macOS agents.
- Authenticate with the short-lived Azure Pipelines job token.
- Preview changes with dry-run mode.
- Choose whether empty parent fields and missing parents clear or preserve child values.
- Batch work item reads and combine each child's changes into one revision-checked update.
- No external service, telemetry, database, or third-party data transfer.

## Example

```yaml
- task: ParentFieldSync@1
  inputs:
    parentWorkItemType: User Story
    childWorkItemType: Task
    fieldMappings: |
      Custom.Process
      Custom.Customer=Custom.ChildCustomer
      System.Tags
    dryRun: false
```

Place the task in a scheduled YAML pipeline to keep the project synchronized at the interval you choose.

## Before the first run

The project build service identity must be allowed to view and edit work items. We recommend starting with `dryRun: true`, reviewing the pipeline log, and then enabling updates.

For full setup, clearing behavior, limits, and troubleshooting, see the [documentation](https://github.com/promicroNL/azdo-parent-field-sync/blob/main/docs/configuration.md).

