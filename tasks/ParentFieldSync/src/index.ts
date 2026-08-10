import * as task from "azure-pipelines-task-lib/task";
import type { IRequestOptions } from "typed-rest-client/Interfaces";
import { AzureDevOpsClient } from "./azureDevOpsClient";
import { parseFieldMappings } from "./config";
import { formatSummary, synchronize } from "./synchronize";
import type { SyncLogger } from "./types";

function getRequiredVariable(name: string): string {
  const value = task.getVariable(name);
  if (!value?.trim()) {
    throw new Error(`Required Azure Pipelines variable '${name}' is not available.`);
  }

  return value;
}

function getAccessToken(): string {
  const endpointToken = task.getEndpointAuthorizationParameter(
    "SYSTEMVSSCONNECTION",
    "ACCESSTOKEN",
    true
  );
  const token = endpointToken ?? task.getVariable("System.AccessToken") ?? process.env.SYSTEM_ACCESSTOKEN;

  if (!token?.trim()) {
    throw new Error(
      "The Azure Pipelines job access token is unavailable. Ensure the task runs in an agent job and that the project build service identity is permitted to edit work items."
    );
  }

  task.setSecret(token);
  return token;
}

function getRequestOptions(): IRequestOptions {
  const proxy = task.getHttpProxyConfiguration();
  const cert = task.getHttpCertConfiguration();

  return {
    proxy: proxy ?? undefined,
    cert: cert ?? undefined
  };
}

const logger: SyncLogger = {
  info: (message) => console.log(message),
  warning: (message) => task.warning(message),
  error: (message) => task.error(message),
  debug: (message) => task.debug(message)
};

async function run(): Promise<void> {
  try {
    const organizationUrl = getRequiredVariable("System.CollectionUri");
    const project = getRequiredVariable("System.TeamProject");
    const parentWorkItemType = task.getInput("parentWorkItemType", true)?.trim() ?? "";
    const childWorkItemType = task.getInput("childWorkItemType", true)?.trim() ?? "";
    const fieldMappings = parseFieldMappings(task.getInput("fieldMappings", true) ?? "");
    const dryRun = task.getBoolInput("dryRun", false);

    console.log("Azure DevOps parent-to-child field synchronization");
    console.log(`Project   : ${project}`);
    console.log(`Hierarchy : ${parentWorkItemType} -> ${childWorkItemType}`);
    console.log(
      `Mappings  : ${fieldMappings.map((mapping) => `${mapping.source} -> ${mapping.target}`).join(", ")}`
    );
    console.log(`Mode      : ${dryRun ? "dry run" : "update"}`);
    console.log("");

    const client = new AzureDevOpsClient(
      organizationUrl,
      project,
      getAccessToken(),
      getRequestOptions()
    );
    const stats = await synchronize(
      client,
      {
        parentWorkItemType,
        childWorkItemType,
        fieldMappings,
        preserveChildValueWhenParentEmpty: task.getBoolInput(
          "preserveChildValueWhenParentEmpty",
          false
        ),
        preserveChildValueWhenNoParent: task.getBoolInput("preserveChildValueWhenNoParent", false),
        replaceChildTags: task.getBoolInput("replaceChildTags", false),
        dryRun
      },
      logger
    );

    console.log("");
    for (const line of formatSummary(stats, dryRun)) {
      console.log(line);
    }

    if (stats.errors > 0) {
      task.setResult(
        task.TaskResult.Failed,
        `Synchronization completed with ${stats.errors} error(s).`
      );
      return;
    }

    task.setResult(task.TaskResult.Succeeded, "Parent field synchronization completed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    task.setResult(task.TaskResult.Failed, message);
  }
}

void run();
