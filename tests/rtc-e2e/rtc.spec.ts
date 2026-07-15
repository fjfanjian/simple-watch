import { AccessToken, TrackSource } from "livekit-server-sdk";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const livekitUrl = "ws://127.0.0.1:17880";
const apiKey = "predeploy-api-key";
const apiSecret = "predeploy-livekit-secret-at-least-32-bytes";

test("five Chrome clients publish microphone-only tracks and see the room", async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 5; index += 1) {
      const identity = `smoke-${index + 1}`;
      const accessToken = new AccessToken(apiKey, apiSecret, {
        identity,
        name: identity,
        ttl: "5m",
      });
      accessToken.addGrant({
        room: "voice:predeploy",
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
      });
      const context = await browser.newContext({
        permissions: ["microphone"],
      });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.addScriptTag({
        type: "module",
        content:
          "import * as harness from '/src/rtc-smoke.ts'; window.rtcHarness = harness;",
      });
      await page.waitForFunction(() => "rtcHarness" in window);
      const connected = await page.evaluate(
        async ({ url, token }) =>
          (
            window as unknown as {
              rtcHarness: {
                connectFakeParticipant(
                  url: string,
                  token: string,
                ): Promise<{
                  microphoneTracks: number;
                  cameraTracks: number;
                }>;
              };
            }
          ).rtcHarness.connectFakeParticipant(url, token),
        { url: livekitUrl, token: await accessToken.toJwt() },
      );
      expect(connected.microphoneTracks).toBe(1);
      expect(connected.cameraTracks).toBe(0);
      const expectedParticipants = index + 1;
      for (const connectedPage of pages) {
        await expect
          .poll(() =>
            connectedPage.evaluate(() =>
              (
                window as unknown as {
                  rtcHarness: { participantCount(): number };
                }
              ).rtcHarness.participantCount(),
            ),
          )
          .toBe(expectedParticipants);
      }
    }
  } finally {
    for (const page of pages) {
      await page
        .evaluate(() =>
          (
            window as unknown as {
              rtcHarness?: { disconnectAll(): void };
            }
          ).rtcHarness?.disconnectAll(),
        )
        .catch(() => undefined);
    }
    for (const context of contexts) await context.close();
  }
});
