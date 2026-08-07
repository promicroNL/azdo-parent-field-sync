# Privacy policy

Parent Field Sync does not collect telemetry, analytics, personal information, or usage data.

During a pipeline run, the task reads configured Azure Boards work items and updates mapped fields in the same Azure DevOps organization and project. Data is processed only in the pipeline agent's memory and Azure Pipelines log. The extension does not operate an external service, store work item data, or transmit it to ProMicro or another third party.

Pipeline logs can contain work item IDs, field reference names, work item types, and task status. Field values and access tokens are not intentionally logged. Azure DevOps retention and access policies govern those logs.

The task receives a short-lived Azure Pipelines job token from the built-in `SystemVssConnection`, registers it as a masked secret, and uses it only to call Azure DevOps Work Item Tracking APIs for the organization where the pipeline runs.

Questions can be submitted through the repository's [issue tracker](https://github.com/promicroNL/azdo-parent-field-sync/issues).

