export class RetryPolicy {
  constructor(private readonly maxAttempts = 3) {}
  shouldRetry(attempt: number): boolean {
    return attempt < this.maxAttempts;
  }
}
