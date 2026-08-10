# Parent Field Sync

Keep Azure Boards child work items aligned with their parents, without managing PATs or hosting a separate service.

Parent Field Sync adds a native Azure Pipelines task that copies one or more fields from direct parent work items to selected child work item types. It supports scalar values used by text, picklist, numeric, boolean, date, GUID, custom, and tag (`System.Tags`) fields.

## Highlights

- Configure multiple same-name or cross-field mappings in one task.
- Run on Microsoft-hosted or self-hosted Windows, Linux, and macOS agents.
- Authenticate with the short-lived Azure Pipelines job token.
- Preview changes with dry-run mode.
- Choose whether empty parent fields and missing parents clear or preserve child values.
- Merge parent tags by default or opt into exact `System.Tags` replacement.
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
    replaceChildTags: true
    dryRun: true
```

Place the task in a scheduled YAML pipeline to keep the project synchronized at the interval you choose. After reviewing a dry run, set `dryRun` to `false` to apply updates.

## Recommended pattern

Keep editable business fields such as Process, Customer, and Workstream on the parent. Synchronize them into dedicated child reporting fields such as `Custom.ParentProcess`, then use flat Task queries to sum Remaining Work, Completed Work, or Original Estimate by those copied attributes.

Put synchronized fields in a dedicated **Parent information** or **Reporting** group on the Task form. If you make them read-only for normal users, exempt the pipeline's build-service identity because Azure DevOps also enforces field rules through REST API updates.

See [Example uses and recommendations](https://github.com/promicroNL/azdo-parent-field-sync#example-uses-and-recommendations) for complete mappings, safe read-only rule setup, picklist guidance, reparenting, and reconciliation examples.

## Before the first run

The project build service identity must be allowed to view and edit work items. We recommend starting with `dryRun: true`, reviewing the pipeline log, and then enabling updates.

For full setup, clearing behavior, limits, and troubleshooting, see the [documentation](https://github.com/promicroNL/azdo-parent-field-sync/blob/main/docs/configuration.md).
