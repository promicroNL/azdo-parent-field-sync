# Parent Field Sync

Parent Field Sync is an Azure DevOps extension that adds a cross-platform Azure Pipelines task for copying selected Azure Boards fields from parent work items to their children.

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
    replaceChildTags: true
```

Use `Source.ReferenceName` when the same field exists on both types. Use `Source.ReferenceName=Target.ReferenceName` to copy to a differently named child field.

## Behavior

- Only direct parent links (`System.LinkTypes.Hierarchy-Reverse`) are considered.
- Only parents with the configured parent work item type are used.
- Scalar values used by text, picklist, numeric, boolean, date, GUID, custom, and `System.Tags` fields are supported.
- Object-valued fields, such as Identity fields, are not supported.
- Empty parent values clear child values by default.
- Children without a parent have mapped values cleared by default.
- `System.Tags` mappings add parent tags and preserve child-only tags by default.
- `replaceChildTags: true` makes mappings targeting `System.Tags` replace the child's complete tag set.
- `dryRun: true` reports intended changes without writing them.
- Multiple mappings are applied to each child in one JSON Patch request guarded by the child's revision.

## Example uses and recommendations

### Report Task effort by a parent field

Suppose a User Story owns `Custom.Process`, while its Tasks contain numeric effort fields such as Remaining Work, Completed Work, and Original Estimate. Copy the parent value into a dedicated Task reporting field:

```yaml
fieldMappings: |
  Custom.Process=Custom.ParentProcess
```

You can then build a flat Task query and create charts such as:

- Sum Remaining Work by Parent Process
- Sum Completed Work by Parent Process
- Sum Original Estimate by Parent Process

Azure DevOps query-based charts use flat-list queries and can sum numeric fields grouped by a field in that query. They cannot group Tasks by an arbitrary custom field that exists only on the parent, so copying that value to the Task makes this reporting model possible. See [query-based chart requirements](https://learn.microsoft.com/en-us/azure/devops/report/dashboards/charts?view=azure-devops).

The same pattern works for customer, workstream, or other parent attributes:

```yaml
fieldMappings: |
  Custom.Process=Custom.ParentProcess
  Custom.Customer=Custom.ParentCustomer
  Custom.Workstream=Custom.ParentWorkstream
```

The task synchronizes all configured mappings in the same run and combines changes for each Task into one update. The copied fields can be used in Task queries, dashboards, exports, Analytics, and integrations without entering the parent information again on every Task.

### Treat the parent as the source of truth

Prefer one owner for each business value:

- Parent field: editable business field.
- Child field: synchronized reporting copy.
- Users edit Process, Customer, or Workstream only on the User Story.
- The scheduled task reconciles the corresponding Task fields.

To discourage manual edits, place synchronized fields in a dedicated Task form group such as **Parent information**, **Inherited fields**, or **Reporting**.

You can also make them read-only for normal users, but do not create an unconditional read-only rule. Azure DevOps enforces field rules through the REST API as well as the work item form, so an unconditional rule would block this task. A safe inherited-process setup is:

1. Create an Azure DevOps security group such as `Parent Field Sync Writers`.
2. Add the pipeline identity, normally `<Project Name> Build Service (<Organization Name>)`, to that group.
3. On the Task work item type, create a rule with the condition **Current user is not a member of group** `Parent Field Sync Writers`.
4. Add **Make read-only** actions for the synchronized reporting fields.
5. Test both a manual edit and a pipeline synchronization in a test project.

Use an Azure DevOps security group rather than a Microsoft Entra group for this rule. See [Azure DevOps rule evaluation and group-scoped read-only rules](https://learn.microsoft.com/en-us/azure/devops/organizations/settings/work/rule-reference?view=azure-devops).

### Use separate child fields when values are restricted

Avoid mapping a parent picklist into a child target that rejects some of the parent's allowed values. Prefer a separate String field when the child copy is only needed for reporting:

```text
Parent: Custom.Process       (business picklist)
Child:  Custom.ParentProcess (String reporting field)
```

Create the child field with the intended data type before using it; Azure DevOps does not allow a custom field's data type to be changed later. See [custom field configuration](https://learn.microsoft.com/en-us/azure/devops/organizations/settings/work/add-custom-field?view=azure-devops).

### Reconcile reparented and existing Tasks

Run the task on a schedule, commonly every 15 or 30 minutes. Each run scans the configured child work item type and updates mapped values that differ. This reconciles:

- Tasks moved to a different parent.
- Values changed manually.
- Older Tasks created before the task was installed.
- Fields added to `fieldMappings` later.

For example, if a Task moves from a User Story whose Process is `Kantoor` to one whose Process is `Consultancy`, the next run changes its synchronized Process value to `Consultancy`. Azure Boards supports changing parent/child links; see [manage parent/child links](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/add-link?view=azure-devops#manage-parentchild-links).

For `System.Tags`, remember that the default behavior adds parent tags and preserves child-only tags. Use `replaceChildTags: true` when the child's complete tag set must converge exactly on the parent value.

### Recommended model

```text
User Story
├── Custom.Process          ← editable
├── Custom.Customer         ← editable
└── Custom.Workstream       ← editable

            ↓ synchronization

Task
├── Custom.ParentProcess    ← reporting copy; read-only for normal users
├── Custom.ParentCustomer   ← reporting copy; read-only for normal users
├── Custom.ParentWorkstream ← reporting copy; read-only for normal users
├── Remaining Work
└── Completed Work
```

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
