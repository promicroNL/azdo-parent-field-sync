# Security policy

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Contact the repository maintainers through the private security reporting option on GitHub. Include the affected version, impact, reproduction steps, and any suggested mitigation.

## Security model

- The task runs on an Azure Pipelines agent under the pipeline job's identity.
- It uses the short-lived `SystemVssConnection` access token and marks that token as secret.
- It calls only Azure DevOps Work Item Tracking endpoints derived from `System.CollectionUri` and `System.TeamProject`.
- It requests no PAT input, external service connection, or third-party credential.
- It does not collect telemetry or persist work item data.
- Work item updates include a revision test to avoid silently overwriting concurrent changes.
- Azure DevOps field rules, area-path permissions, and job authorization scope remain authoritative.

Use Microsoft-hosted agents or appropriately isolated self-hosted agents for untrusted repositories. Review dependency and VSIX scan results before each public release.

