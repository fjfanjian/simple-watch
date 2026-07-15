import { describe, expect, it } from "vitest";

import {
  estimateClock,
  positionAt,
  selectBestClockEstimate,
} from "../src/index.js";

describe("synchronization primitives", () => {
  it("estimates clock offset while excluding server processing time", () => {
    expect(
      estimateClock({
        clientSentAtMs: 1_000,
        serverReceivedAtMs: 1_060,
        serverSentAtMs: 1_070,
        clientReceivedAtMs: 1_120,
      }),
    ).toEqual({ offsetMs: 5, roundTripMs: 110 });
  });

  it("projects a running playback anchor", () => {
    expect(
      positionAt(
        {
          effectiveAtMs: 10_000,
          mediaId: null,
          paused: false,
          positionSeconds: 5,
          rate: 1.5,
          revision: 1,
        },
        12_000,
      ),
    ).toBe(8);
  });

  it("selects the lowest latency clock estimate", () => {
    expect(
      selectBestClockEstimate([
        { offsetMs: 5, roundTripMs: 80 },
        { offsetMs: 7, roundTripMs: 20 },
      ]),
    ).toEqual({ offsetMs: 7, roundTripMs: 20 });
  });
});
