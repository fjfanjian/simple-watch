import type { PlaybackAnchor } from "@simplewatch/contracts";

export interface ClockSample {
  readonly clientSentAtMs: number;
  readonly serverReceivedAtMs: number;
  readonly serverSentAtMs: number;
  readonly clientReceivedAtMs: number;
}

export interface ClockEstimate {
  readonly offsetMs: number;
  readonly roundTripMs: number;
}

export function estimateClock(sample: ClockSample): ClockEstimate {
  const roundTripMs =
    sample.clientReceivedAtMs -
    sample.clientSentAtMs -
    (sample.serverSentAtMs - sample.serverReceivedAtMs);
  const offsetMs =
    (sample.serverReceivedAtMs -
      sample.clientSentAtMs +
      sample.serverSentAtMs -
      sample.clientReceivedAtMs) /
    2;

  return { offsetMs, roundTripMs: Math.max(0, roundTripMs) };
}

export function positionAt(
  anchor: PlaybackAnchor,
  serverNowMs: number,
): number {
  if (anchor.paused || serverNowMs <= anchor.effectiveAtMs)
    return anchor.positionSeconds;

  const elapsedSeconds = (serverNowMs - anchor.effectiveAtMs) / 1000;
  return Math.max(0, anchor.positionSeconds + elapsedSeconds * anchor.rate);
}

export function selectBestClockEstimate(
  samples: readonly ClockEstimate[],
): ClockEstimate | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, current) =>
    current.roundTripMs < best.roundTripMs ? current : best,
  );
}
