import type {
  RemoteSyncPort,
} from "@/repository/ports/sync";
import type { SyncPushRequest, SyncPushResponse } from "@/domain/sync/types";

export const DEFAULT_SYNC_ENDPOINT = "/api/sync";

export class SyncHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
  ) {
    super(message);
    this.name = "SyncHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface HttpRemoteSyncOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export function createHttpRemoteSync(
  options: HttpRemoteSyncOptions = {},
): RemoteSyncPort {
  const endpoint = options.endpoint ?? DEFAULT_SYNC_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async push(request: SyncPushRequest): Promise<SyncPushResponse> {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
      } catch (error) {
        throw new SyncHttpError(
          0,
          "NETWORK_UNAVAILABLE",
          error instanceof Error ? error.message : "network error",
        );
      }
      if (!response.ok) {
        let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          body = {};
        }
        throw new SyncHttpError(
          response.status,
          body.error?.code ?? "SYNC_FAILED",
          body.error?.message ?? `Sync endpoint replied ${response.status}`,
          body.error?.details,
        );
      }
      return (await response.json()) as SyncPushResponse;
    },
  };
}