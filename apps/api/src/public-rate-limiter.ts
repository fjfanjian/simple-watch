interface RateBucket {
  count: number;
  resetAt: number;
}

export class PublicRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  public constructor(private readonly now: () => number) {}

  public isAllowed(key: string, limit: number): boolean {
    const timestamp = this.now();
    const current = this.buckets.get(key);
    return !current || current.resetAt <= timestamp || current.count < limit;
  }

  public record(key: string, windowMs: number): void {
    const timestamp = this.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= timestamp) {
      this.buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
      this.prune(timestamp);
      return;
    }
    current.count += 1;
  }

  private prune(timestamp: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= timestamp) this.buckets.delete(key);
    }
  }
}
