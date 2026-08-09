import * as httpm from "typed-rest-client/HttpClient";
import { BearerCredentialHandler } from "typed-rest-client/Handlers";
import type { IRequestOptions } from "typed-rest-client/Interfaces";
import type { FieldMutation, WorkItem, WorkItemClient } from "./types";

const API_VERSION = "7.1";
const MAX_BATCH_SIZE = 200;

interface ListResponse<T> {
  value: T[];
}

interface WiqlResponse {
  workItems?: Array<{ id: number }>;
}

interface WorkItemTypeField {
  referenceName?: string;
}

interface JsonPatchOperation {
  op: "test" | "add" | "remove";
  path: string;
  value?: unknown;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function escapeWiqlString(value: string): string {
  return value.replaceAll("'", "''");
}

export class AzureDevOpsClient implements WorkItemClient {
  private readonly apiBase: string;
  private readonly httpClient: httpm.HttpClient;

  public constructor(
    organizationUrl: string,
    project: string,
    accessToken: string,
    requestOptions: IRequestOptions = {}
  ) {
    const normalizedOrganizationUrl = organizationUrl.replace(/\/+$/u, "");
    this.apiBase = `${normalizedOrganizationUrl}/${encodeURIComponent(project)}/_apis/wit`;
    this.httpClient = new httpm.HttpClient(
      "promicro-parent-field-sync/1.0.2",
      [new BearerCredentialHandler(accessToken)],
      {
        allowRetries: true,
        maxRetries: 3,
        ...requestOptions
      }
    );
  }

  public async assertFieldAvailable(
    workItemType: string,
    fieldReferenceName: string
  ): Promise<void> {
    const path = `/workitemtypes/${encodeURIComponent(workItemType)}/fields/${encodeURIComponent(fieldReferenceName)}?api-version=${API_VERSION}`;
    const field = await this.request<WorkItemTypeField>("GET", path);

    if (field.referenceName !== fieldReferenceName) {
      throw new Error(
        `Azure DevOps returned field '${field.referenceName ?? "<unknown>"}' while '${fieldReferenceName}' was requested on '${workItemType}'.`
      );
    }
  }

  public async queryWorkItemIds(workItemType: string): Promise<number[]> {
    const query = [
      "SELECT [System.Id]",
      "FROM WorkItems",
      "WHERE",
      "    [System.TeamProject] = @Project",
      `    AND [System.WorkItemType] = '${escapeWiqlString(workItemType)}'`,
      "ORDER BY [System.Id]"
    ].join("\n");
    const response = await this.request<WiqlResponse>("POST", `/wiql?api-version=${API_VERSION}`, {
      query
    });

    return (response.workItems ?? []).map((item) => item.id);
  }

  public async getWorkItems(
    ids: number[],
    fields: string[],
    includeRelations: boolean
  ): Promise<WorkItem[]> {
    const workItems: WorkItem[] = [];

    for (let offset = 0; offset < ids.length; offset += MAX_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + MAX_BATCH_SIZE);
      const query = new URLSearchParams({
        ids: batch.join(","),
        errorPolicy: "Omit",
        "api-version": API_VERSION
      });

      if (includeRelations) {
        query.set("$expand", "Relations");
      } else {
        query.set("fields", [...new Set(fields)].join(","));
      }

      const response = await this.request<ListResponse<WorkItem>>(
        "GET",
        `/workitems?${query.toString()}`
      );
      workItems.push(...response.value);
    }

    return workItems;
  }

  public async updateFields(
    id: number,
    revision: number,
    mutations: FieldMutation[]
  ): Promise<void> {
    const patch: JsonPatchOperation[] = [
      {
        op: "test",
        path: "/rev",
        value: revision
      },
      ...mutations.map((mutation): JsonPatchOperation => {
        const operation: JsonPatchOperation = {
          op: mutation.remove ? "remove" : "add",
          path: `/fields/${escapeJsonPointerSegment(mutation.field)}`
        };

        if (!mutation.remove) {
          operation.value = mutation.value;
        }

        return operation;
      })
    ];

    await this.request<WorkItem>(
      "PATCH",
      `/workitems/${id}?api-version=${API_VERSION}`,
      patch,
      "application/json-patch+json"
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    contentType = "application/json"
  ): Promise<T> {
    const response = await this.httpClient.request(
      method,
      `${this.apiBase}${path}`,
      body === undefined ? "" : JSON.stringify(body),
      {
        Accept: "application/json",
        "Content-Type": contentType
      }
    );
    const responseBody = await response.readBody();

    const statusCode = response.message.statusCode ?? 0;
    if (statusCode < 200 || statusCode >= 300) {
      let detail = responseBody.trim();
      try {
        const parsed = JSON.parse(responseBody) as { message?: string };
        detail = parsed.message ?? detail;
      } catch {
        // Preserve the plain-text response when it is not JSON.
      }

      throw new Error(
        `Azure DevOps request failed (${method} ${path}, HTTP ${statusCode}): ${detail || response.message.statusMessage || "No response body"}`
      );
    }

    if (responseBody.trim().length === 0) {
      return undefined as T;
    }

    return JSON.parse(responseBody) as T;
  }
}
