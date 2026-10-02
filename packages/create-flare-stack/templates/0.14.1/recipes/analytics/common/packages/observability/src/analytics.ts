/**
 * Cloudflare Analytics Engine dataset helper.
 * Provides typed data point construction for telemetry events.
 */
export interface AnalyticsDataPoint {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
}

export interface AnalyticsEngineDataset {
  writeDataPoint(point: AnalyticsDataPoint): void;
}

export function writeAnalyticsEvent(
  dataset: AnalyticsEngineDataset | undefined,
  event: {
    name: string;
    blobValues?: string[];
    doubleValues?: number[];
  },
): void {
  if (!dataset) return;
  dataset.writeDataPoint({
    indexes: [event.name],
    blobs: event.blobValues ?? [],
    doubles: event.doubleValues ?? [],
  });
}
