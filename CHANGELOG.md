# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release notes before this file was introduced were reconstructed from the packaged VSIX
artifacts and the repository history.

## [Unreleased]

### Added

- Added this retroactive changelog and linked it from the project documentation.

## [1.1.0] - 2026-08-10

### Added

- Added the `replaceChildTags` task input. When enabled, mappings targeting
  `System.Tags` replace the child's complete tag set instead of preserving child-only tags.
- Added support for exact tag replacement in both same-field and cross-field mappings.

### Changed

- Expanded the Marketplace and project documentation with guidance for parent-owned
  reporting fields, read-only child fields, reparenting, and reconciliation.

## [1.0.2] - 2026-08-09

### Changed

- Made the extension available as a public preview in the Visual Studio Marketplace.
- Updated the Azure DevOps REST client identifier to report the packaged extension version.
- Clarified the supported scalar field types, dry-run workflow, and Marketplace guidance.
- Added packaging checks for public visibility and required Marketplace assets.

## [1.0.1] - 2026-08-08

### Fixed

- Fixed parent discovery by no longer combining the Work Items API's `fields` filter with
  relation expansion.

### Changed

- Raised the minimum supported Azure Pipelines agent version to `3.232.1`.
- Corrected the Promicro name in the packaged license.

## [1.0.0] - 2026-08-08

### Added

- Released the initial cross-platform `ParentFieldSync@1` Azure Pipelines task.
- Added configurable parent and child work item types with same-field and cross-field mappings.
- Added optional preservation of child values when a parent value is empty or no parent exists.
- Added dry-run reporting, batched work item reads, and revision-checked updates.
- Added authentication through the built-in Azure Pipelines job token, with no PAT or external
  service required.
- Added configuration, publishing, privacy, security, and scheduled-pipeline documentation.
