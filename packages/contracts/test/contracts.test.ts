import { describe, expect, it } from "vitest";

import { playbackAnchorSchema } from "../src/index.js";

describe("playbackAnchorSchema", () => {
  it("accepts a valid synchronized playback anchor", () => {
    const anchor = {
      mediaId: "43cc0df5-ec55-49aa-bb61-a0760562dd50",
      paused: false,
      positionSeconds: 12.5,
      rate: 1,
      effectiveAtMs: 1_750_000_000_000,
      revision: 3,
    };

    expect(playbackAnchorSchema.parse(anchor)).toEqual(anchor);
  });

  it("rejects unsupported playback rates", () => {
    expect(() =>
      playbackAnchorSchema.parse({
        mediaId: null,
        paused: true,
        positionSeconds: 0,
        rate: 3,
        effectiveAtMs: 0,
        revision: 0,
      }),
    ).toThrow();
  });
});
