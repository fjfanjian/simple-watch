import { describe, expect, it } from "vitest";

import { PublicRateLimiter } from "../src/public-rate-limiter.js";

describe("PublicRateLimiter", () => {
  it("tracks failures per window and resets after expiry", () => {
    let now = 1000;
    const limiter = new PublicRateLimiter(() => now);

    expect(limiter.isAllowed("login", 2)).toBe(true);
    limiter.record("login", 60_000);
    expect(limiter.isAllowed("login", 2)).toBe(true);
    limiter.record("login", 60_000);
    expect(limiter.isAllowed("login", 2)).toBe(false);

    now += 60_000;
    expect(limiter.isAllowed("login", 2)).toBe(true);
    limiter.record("login", 60_000);
    expect(limiter.isAllowed("login", 2)).toBe(true);
  });
});
