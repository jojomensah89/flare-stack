export interface RequestLogFields {
  requestId: string;
  method: string;
  path: string;
  status: number;
  userId?: string;
  operation?: string;
  resourceId?: string;
  outcome: "success" | "error" | "aborted";
  durationMs: number;
  [key: string]: unknown;
}
