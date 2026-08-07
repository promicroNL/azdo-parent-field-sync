# azdo-parent-field-sync

This repository contains lightweight PowerShell scripts for Azure DevOps work item automation.

## Goal

Keep child work items aligned with their parent by syncing selected parent field values down to linked child items.

## What the scripts are for

- Query parent/child relationships in Azure DevOps
- Read configured fields from parent work items
- Update those fields on child work items
- Run quickly with minimal dependencies and simple configuration

## Scope

The focus is small, practical PowerShell tooling for scheduled or manual sync runs, not a large service or framework.

## Basic usage

Run the script from the scripts folder with your Azure DevOps organization, project, and source field reference name:

```powershell
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'Custom.Process'
```

The script will copy the value from the parent work item field to matching child work items that are linked through the parent/child hierarchy.

## Example: sync a custom field

If you want to copy a custom field from a parent User Story to child Tasks:

```powershell
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'Custom.Process' `
  -ParentWorkItemType 'User Story' `
  -ChildWorkItemType 'Task'
```

## Example: sync to a different child field

You can also sync the parent field to a differently named child field:

```powershell
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'Custom.Process' `
  -TargetFieldReferenceName 'Custom.ChildProcess'
```

## Example: sync tags

Tags are supported when you use the built-in tag field:

```powershell
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'System.Tags'
```

This copies the parent work item's tag string to the child work item field. It does not create or manage individual tags as separate entities; it copies the full field value.

## Example: preserve child values when the parent is empty

Use these switches if you want to avoid clearing child values when the parent has no value:

```powershell
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'Custom.Process' `
  -PreserveChildValueWhenParentEmpty `
  -PreserveChildValueWhenNoParent
```

## Notes

- Use the Azure DevOps field reference name, not the display name.
- The script is intended for scalar fields such as strings, picklists, numbers, booleans, dates, and GUIDs.
- For tags, use System.Tags as the field reference name.
- The script validates that both the source and target fields are available on the selected parent and child work item types.

## Authentication

The script can use either:

- an Azure DevOps PAT from the AZDO_PAT environment variable, or
- the SYSTEM_ACCESSTOKEN environment variable in Azure Pipelines

Example for a local run:

```powershell
$env:AZDO_PAT = 'your-pat-here'
./Sync-ParentFieldToChildren.ps1 `
  -OrganizationUrl 'https://dev.azure.com/your-org' `
  -Project 'Your Project' `
  -SourceFieldReferenceName 'Custom.Process'
```
