/**
 * Cloudflare Queue helper for job dispatching and batch processing.
 */
export interface QueueMessage<T = unknown> {
  id: string;
  timestamp: number;
  body: T;
}

export interface QueueProducer<T = unknown> {
  send(body: T): Promise<void>;
  sendBatch(messages: Iterable<{ body: T }>): Promise<void>;
}

export async function sendQueueMessage<T>(
  queue: QueueProducer<T> | undefined,
  body: T,
): Promise<boolean> {
  if (!queue) return false;
  await queue.send(body);
  return true;
}
