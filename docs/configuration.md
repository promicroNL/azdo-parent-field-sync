# Configuration

## Task inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `parentWorkItemType` | Yes | `User Story` | Exact parent work item type name. |
| `childWorkItemType` | Yes | `Task` | Exact child type queried and updated. |
| `fieldMappings` | Yes | `Custom.Process` | One source or source-to-target mapping per line. |
| `preserveChildValueWhenParentEmpty` | No | `false` | Do not clear a child field when its parent field is empty. |
| `preserveChildValueWhenNoParent` | No | `false` | Do not clear mapped fields when a child has no parent. |
| `replaceChildTags` | No | `false` | Replace the child's complete `System.Tags` value instead of adding parent tags. |
| `dryRun` | No | `false` | Calculate and log changes without updating work items. |

Blank lines and lines beginning with `#` are ignored in `fieldMappings`.

```yaml
fieldMappings: |
  # Same source and target reference name
  Custom.Process

  # Different target reference name
  Custom.Customer=Custom.ChildCustomer
```

Each target field can appear only once. The task validates every field against its configured work item type before querying work items.

## Tag behavior

Azure DevOps treats an `add` update to `System.Tags` as an additive operation. By default, mappings targeting `System.Tags` add the mapped parent tags while preserving tags that exist only on the child.

Set `replaceChildTags: true` to make the mapped value authoritative. When the child already has tags, the task uses a replace operation so child-only tags are removed. When the child has no tag value yet, the task adds the mapped tags. The option is based on the target field, so it also applies to a cross-field mapping such as `Custom.ParentTags=System.Tags`.

If the parent has a link but its mapped tag field is empty, `replaceChildTags` has no effect. By default, the child tags are cleared because an empty parent field clears the mapped child field. Set `preserveChildValueWhenParentEmpty: true` to keep the existing child tags in that case. This setting also preserves other mapped child fields whose parent values are empty.

## Authentication and permissions

No PAT or service connection input is required. The task uses the short-lived job access token supplied by Azure Pipelines through `SystemVssConnection`.

The pipeline's build service identity needs these Azure Boards permissions in the relevant project/area path:

- View work items in this node
- Edit work items in this node

For a project-scoped job token, the identity is normally named `<Project Name> Build Service (<Organization Name>)`. Keep job authorization scope limited to the current project unless the pipeline genuinely needs broader access.

## Scheduling

An Azure DevOps extension cannot execute unattended code inside the Azure DevOps service. Schedule the task through a YAML pipeline. See [`examples/scheduled-sync.yml`](../examples/scheduled-sync.yml).

Azure Pipelines evaluates scheduled YAML from the configured branch. With `always: true`, the task runs even when the repository has not changed.

## Clearing behavior

The default is authoritative parent-to-child synchronization for fields other than `System.Tags`:

- An empty or missing parent source field removes the target field from the child.
- A child with no parent has every populated mapped target field removed.
- A child whose parent has a different work item type is left unchanged.
- A parent that cannot be read is reported and the child is left unchanged.

Enable either preservation input when clearing is not desired. Start with `dryRun: true` when adopting the task in an existing project.

For reporting-field mappings, safe read-only rules, picklist guidance, reparenting, and scheduled reconciliation examples, see [Example uses and recommendations](../README.md#example-uses-and-recommendations).

## Limits

- Direct parent/child hierarchy links only.
- A WIQL query can return at most the Azure DevOps service limit for a single query.
- Work item reads are automatically split into batches of 200.
- Object-valued fields, such as Identity fields, are not supported; mapped values must be strings, numbers, booleans, or null.
- Azure DevOps field rules and permissions still apply to every update.
