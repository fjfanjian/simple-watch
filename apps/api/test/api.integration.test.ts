import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { v7 as uuidv7 } from "uuid";
import { AccessToken } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawData, WebSocket } from "ws";

import { buildApp, type BuiltApp } from "../src/app.js";
import { openDatabase } from "../src/database.js";

const origin = "https://watch.example.test";
const fixedNow = 1_750_000_000_000;
const internalToken = "test-internal-service-token-32-bytes";
const temporaryRoots: string[] = [];
let built: BuiltApp;
let testRoot: string;

beforeEach(async () => {
  const tmpRoot = resolve("tmp");
  mkdirSync(tmpRoot, { recursive: true });
  testRoot = mkdtempSync(join(tmpRoot, "api-test-"));
  temporaryRoots.push(testRoot);
  built = await buildApp({
    databasePath: join(testRoot, "simplewatch.sqlite3"),
    migrationsPath: resolve("migrations"),
    publicOrigin: origin,
    mediaRoot: join(testRoot, "media"),
    uploadRoot: join(testRoot, "uploads"),
    inboxRoot: join(testRoot, "inbox"),
    subtitleRoot: join(testRoot, "subtitles"),
    tusEndpoint: `${origin}/files/`,
    contentSigningSecret: "test-content-signing-secret-32-bytes",
    internalHookToken: internalToken,
    now: () => fixedNow,
  });
  await built.authService.bootstrapAdmin(
    "admin",
    "correct-horse-battery-staple",
  );
});

afterEach(async () => {
  await built.app.close();
  for (const path of temporaryRoots.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("SimpleWatch API", () => {
  it("verifies LiveKit webhooks and re-enqueues an inactive participant idempotently", async () => {
    // Arrange
    const roomId = uuidv7();
    const memberId = uuidv7();
    const body = JSON.stringify({
      id: "EV_webhook_test",
      event: "participant_joined",
      room: { name: `voice:${roomId}` },
      participant: { identity: memberId },
      createdAt: fixedNow,
    });
    const webhookToken = new AccessToken(
      "test-api-key",
      "test-livekit-secret-at-least-32-bytes",
    );
    webhookToken.sha256 = createHash("sha256").update(body).digest("base64");
    const authorization = await webhookToken.toJwt();

    // Act
    const accepted = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/livekit/webhook",
      headers: {
        authorization,
        "content-type": "application/webhook+json",
      },
      payload: body,
    });
    const replayed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/livekit/webhook",
      headers: {
        authorization,
        "content-type": "application/webhook+json",
      },
      payload: body,
    });
    const rejected = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/livekit/webhook",
      headers: {
        authorization: "invalid",
        "content-type": "application/webhook+json",
      },
      payload: body,
    });

    // Assert
    expect(accepted.statusCode).toBe(204);
    expect(replayed.statusCode).toBe(204);
    expect(rejected.statusCode).toBe(401);
    const queued = built.database
      .prepare(
        "SELECT kind, payload_json FROM service_outbox WHERE dedupe_key = ?",
      )
      .all("rtc-remove:webhook:EV_webhook_test") as Array<{
      kind: string;
      payload_json: string;
    }>;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "rtc.remove-participant" });
    expect(JSON.parse(queued[0]?.payload_json ?? "{}")).toEqual({
      roomId,
      memberId,
    });
  });

  it("issues scoped RTC credentials and validates the actual MediaMTX action/path", async () => {
    const room = await createRoom();
    const bootstrap = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${room.roomId}/bootstrap`,
      headers: { cookie: room.roomCookie },
    });
    const csrfToken = bootstrap.json<{ csrfToken: string }>().csrfToken;
    const authHeaders = {
      cookie: room.roomCookie,
      origin,
      "x-csrf-token": csrfToken,
    };

    const voice = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/credentials`,
      headers: authHeaders,
      payload: { purpose: "voice" },
    });
    expect(voice.statusCode).toBe(200);
    expect(voice.json()).toMatchObject({
      purpose: "voice",
      url: "ws://127.0.0.1:7880",
    });

    const whep = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/credentials`,
      headers: authHeaders,
      payload: { purpose: "whep" },
    });
    expect(whep.statusCode).toBe(200);
    const mediaCredential = whep.json<{
      token: string;
      path: string;
    }>();
    const allowed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/mediamtx/auth",
      headers: { origin },
      payload: {
        token: mediaCredential.token,
        action: "read",
        path: mediaCredential.path,
        id: "whep-session-1",
      },
    });
    expect(allowed.statusCode).toBe(204);

    const wrongPath = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/mediamtx/auth",
      headers: { origin },
      payload: {
        token: mediaCredential.token,
        action: "read",
        path: "another-path",
      },
    });
    expect(wrongPath.statusCode).toBe(403);

    const publish = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/live/publish-config`,
      headers: authHeaders,
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toMatchObject({ purpose: "whip" });
  });

  it("registers only SFTP files already moved into the inbox", async () => {
    const inboxPath = join(testRoot, "inbox", "stable-movie.mp4");
    writeFileSync(inboxPath, "test");
    const imported = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/imports/sftp",
      headers: { "x-internal-token": internalToken },
      payload: { filename: "stable-movie.mp4", filePath: inboxPath, bytes: 4 },
    });
    expect(imported.statusCode).toBe(201);
    const claimed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/jobs/claim",
      headers: { "x-internal-token": internalToken },
      payload: { workerId: "sftp-test" },
    });
    expect(
      claimed.json<{ payload: { source: string; filePath: string } }>().payload,
    ).toMatchObject({ source: "sftp", filePath: inboxPath });

    const outsidePath = join(testRoot, "outside.mp4");
    writeFileSync(outsidePath, "test");
    const rejected = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/imports/sftp",
      headers: { "x-internal-token": internalToken },
      payload: { filename: "outside.mp4", filePath: outsidePath, bytes: 4 },
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("validates tus hooks and enqueues a finished resumable upload idempotently", async () => {
    const admin = await loginAdmin();
    const authorize = await built.app.inject({
      method: "POST",
      url: "/api/v1/uploads/authorize",
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { filename: "resume.mp4", bytes: 4, mime: "video/mp4" },
    });
    const upload = authorize.json<{ uploadId: string; uploadToken: string }>();
    const hookHeaders = { "x-internal-token": internalToken };
    const hookEvent = (type: string, offset = 0) => ({
      Type: type,
      Event: {
        Upload: {
          ID: upload.uploadId,
          Size: 4,
          Offset: offset,
          MetaData: { filename: "resume.mp4", filetype: "video/mp4" },
        },
        HTTPRequest: { Header: { "Upload-Token": [upload.uploadToken] } },
      },
    });

    const preCreate = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/tus/hooks",
      headers: hookHeaders,
      payload: hookEvent("pre-create"),
    });
    expect(preCreate.statusCode).toBe(200);
    expect(preCreate.json()).toMatchObject({
      ChangeFileInfo: { ID: upload.uploadId },
    });

    const tusAllowed = await built.app.inject({
      method: "GET",
      url: "/api/v1/internal/tus/authorize",
      headers: {
        ...hookHeaders,
        "upload-token": upload.uploadToken,
        "x-forwarded-uri": `/files/${upload.uploadId}`,
      },
    });
    expect(tusAllowed.statusCode).toBe(204);

    writeFileSync(join(testRoot, "uploads", upload.uploadId), "test");
    const finish = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/tus/hooks",
      headers: hookHeaders,
      payload: hookEvent("post-finish", 4),
    });
    expect(finish.statusCode).toBe(200);
    const repeated = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/tus/hooks",
      headers: hookHeaders,
      payload: hookEvent("post-finish", 4),
    });
    expect(repeated.statusCode).toBe(200);

    const claimed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/jobs/claim",
      headers: hookHeaders,
      payload: { workerId: "tus-test" },
    });
    expect(
      claimed.json<{ payload: { uploadId: string } }>().payload.uploadId,
    ).toBe(upload.uploadId);
  });

  it("authorizes, probes, publishes, and protects uploaded media", async () => {
    const admin = await loginAdmin();
    const authorize = await built.app.inject({
      method: "POST",
      url: "/api/v1/uploads/authorize",
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { filename: "sample.mp4", bytes: 4, mime: "video/mp4" },
    });
    expect(authorize.statusCode).toBe(201);
    const upload = authorize.json<{ uploadId: string; uploadToken: string }>();
    const receivedPath = join(testRoot, "uploads", `${upload.uploadId}.part`);
    writeFileSync(receivedPath, "test");

    const completed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/uploads/complete",
      headers: { "x-internal-token": internalToken },
      payload: {
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
        filePath: receivedPath,
        receivedBytes: 4,
      },
    });
    expect(completed.statusCode).toBe(201);
    const mediaId = completed.json<{ mediaId: string }>().mediaId;

    const claimed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/jobs/claim",
      headers: { "x-internal-token": internalToken },
      payload: { workerId: "integration-worker" },
    });
    expect(claimed.statusCode).toBe(200);
    let job = claimed.json<{
      id: string;
      leaseToken: string;
      payload: { storageKey: string };
    }>();
    const expiredLeaseToken = job.leaseToken;
    built.database
      .prepare("UPDATE media_jobs SET lease_until = ? WHERE id = ?")
      .run(fixedNow - 1, job.id);
    const reclaimed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/jobs/claim",
      headers: { "x-internal-token": internalToken },
      payload: { workerId: "restarted-integration-worker" },
    });
    expect(reclaimed.statusCode).toBe(200);
    job = reclaimed.json<typeof job>();
    expect(job.leaseToken).not.toBe(expiredLeaseToken);
    const reclaimedState = built.database
      .prepare("SELECT attempts FROM media_jobs WHERE id = ?")
      .get(job.id) as { attempts: number };
    expect(reclaimedState.attempts).toBe(2);
    const publishedDirectory = join(testRoot, "media", job.payload.storageKey);
    mkdirSync(publishedDirectory, { recursive: true });
    const finalPath = join(publishedDirectory, "content.mp4");
    writeFileSync(finalPath, "test");

    const result = await built.app.inject({
      method: "POST",
      url: `/api/v1/internal/jobs/${job.id}/result`,
      headers: { "x-internal-token": internalToken },
      payload: {
        leaseToken: job.leaseToken,
        compatible: true,
        probe: {},
        reasons: [],
        sha256:
          "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        bytes: 4,
        durationMs: 1000,
        finalPath,
      },
    });
    expect(result.statusCode).toBe(204);

    const subtitleContent = "WEBVTT\n\n00:00.000 --> 00:01.000\n你好\n";
    const subtitleJobResponse = await built.app.inject({
      method: "POST",
      url: `/api/v1/admin/media/${mediaId}/subtitles`,
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { language: "zh-CN", label: "中文", content: subtitleContent },
    });
    expect(subtitleJobResponse.statusCode).toBe(202);
    const subtitleJobId = subtitleJobResponse.json<{ jobId: string }>().jobId;
    const subtitleClaim = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/jobs/claim",
      headers: { "x-internal-token": internalToken },
      payload: { workerId: "subtitle-worker" },
    });
    const subtitleJob = subtitleClaim.json<{
      id: string;
      leaseToken: string;
      payload: { storageKey: string; contentBase64: string };
    }>();
    expect(subtitleJob.id).toBe(subtitleJobId);
    const subtitleBytes = Buffer.from(
      subtitleJob.payload.contentBase64,
      "base64",
    );
    const subtitlePath = join(
      testRoot,
      "subtitles",
      `${subtitleJob.payload.storageKey}.vtt`,
    );
    writeFileSync(subtitlePath, subtitleBytes);
    const subtitleResult = await built.app.inject({
      method: "POST",
      url: `/api/v1/internal/jobs/${subtitleJob.id}/subtitle-result`,
      headers: { "x-internal-token": internalToken },
      payload: {
        leaseToken: subtitleJob.leaseToken,
        finalPath: subtitlePath,
        bytes: subtitleBytes.length,
        sha256: createHash("sha256").update(subtitleBytes).digest("hex"),
      },
    });
    expect(subtitleResult.statusCode).toBe(204);
    const mediaMetadata = await built.app.inject({
      method: "GET",
      url: `/api/v1/media/${mediaId}`,
      headers: { cookie: admin.cookie },
    });
    const subtitleId = mediaMetadata.json<{
      subtitles: Array<{ id: string }>;
    }>().subtitles[0]?.id;
    expect(subtitleId).toBeTruthy();
    const subtitle = await built.app.inject({
      method: "GET",
      url: `/api/v1/subtitles/${subtitleId}`,
      headers: { cookie: admin.cookie },
    });
    expect(subtitle.statusCode).toBe(200);
    expect(subtitle.headers["content-type"]).toContain("text/vtt");
    expect(subtitle.body).toBe(subtitleContent);

    const content = await built.app.inject({
      method: "GET",
      url: `/api/v1/media/${mediaId}/content`,
      headers: { cookie: admin.cookie },
    });
    expect(content.statusCode).toBe(307);
    const location = content.headers.location;
    expect(location).toMatch(/^\/media-files\//);

    const allowed = await built.app.inject({
      method: "GET",
      url: "/api/v1/internal/media/authorize",
      headers: {
        cookie: admin.cookie,
        "x-internal-token": internalToken,
        "x-forwarded-method": "GET",
        "x-forwarded-uri": location,
      },
    });
    expect(allowed.statusCode).toBe(204);

    const denied = await built.app.inject({
      method: "GET",
      url: "/api/v1/internal/media/authorize",
      headers: {
        cookie: admin.cookie,
        "x-internal-token": internalToken,
        "x-forwarded-method": "GET",
        "x-forwarded-uri": `${location}x`,
      },
    });
    expect(denied.statusCode).toBe(401);
  });

  it("creates an authenticated room and rotates CSRF during bootstrap", async () => {
    const admin = await loginAdmin();
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/rooms",
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: {
        password: "shared-room-password",
        hostNickname: "主持人",
        maxMembers: 5,
      },
    });

    expect(created.statusCode).toBe(201);
    const createdBody = created.json<{
      room: { id: string; joinUrl: string };
      member: { role: string };
      csrfToken: string;
    }>();
    expect(createdBody).toMatchObject({
      room: { joinUrl: `${origin}/join/${createdBody.room.id}` },
      member: { role: "host" },
    });

    const roomCookie = readCookie(created, "sw_room");
    const bootstrap = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${createdBody.room.id}/bootstrap`,
      headers: { cookie: roomCookie },
    });
    expect(bootstrap.statusCode).toBe(200);
    const bootstrapBody = bootstrap.json<{
      csrfToken: string;
      snapshot: { revision: number; members: unknown[] };
    }>();
    expect(bootstrapBody.snapshot).toMatchObject({ revision: 0 });
    expect(bootstrapBody.snapshot.members).toHaveLength(1);
    expect(bootstrapBody.csrfToken).not.toBe(createdBody.csrfToken);

    const staleCsrfLeave = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${createdBody.room.id}/leave`,
      headers: {
        cookie: roomCookie,
        origin,
        "x-csrf-token": createdBody.csrfToken,
      },
    });
    expect(staleCsrfLeave.statusCode).toBe(401);
  });

  it("enforces room capacity and active nickname uniqueness", async () => {
    const room = await createRoom();
    const firstJoin = await joinRoom(room.roomId, "Alice");
    expect(firstJoin.statusCode).toBe(200);

    const duplicate = await joinRoom(room.roomId, "alice");
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: { code: "NICKNAME_IN_USE" },
    });

    await joinRoom(room.roomId, "Bob");
    await joinRoom(room.roomId, "Carol");
    await joinRoom(room.roomId, "Dave");
    const full = await joinRoom(room.roomId, "Eve");
    expect(full.statusCode).toBe(429);
    expect(full.json()).toMatchObject({ error: { code: "ROOM_FULL" } });
  });

  it("persists idempotent host commands and rejects revision conflicts", async () => {
    const room = await createRoom();
    const identity = built.roomService.authenticate(
      cookieValue(room.roomCookie),
      room.roomId,
    );
    const commandId = uuidv7();
    const command = {
      commandId,
      expectedRevision: 0,
      effectiveAtServerMs: 0,
      command: { kind: "select-live" as const },
    };

    const accepted = built.roomService.applyCommand(identity, command);
    const replayed = built.roomService.applyCommand(identity, command);
    expect(replayed).toEqual(accepted);
    expect(accepted).toMatchObject({ mode: "live", revision: 1 });

    expect(() =>
      built.roomService.applyCommand(identity, {
        ...command,
        commandId: uuidv7(),
      }),
    ).toThrowError("房间状态版本已变化");
  });

  it("hands off host authority and immediately revokes a kicked member", async () => {
    const room = await createRoom();
    const hostBootstrap = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${room.roomId}/bootstrap`,
      headers: { cookie: room.roomCookie },
    });
    const hostCsrf = hostBootstrap.json<{ csrfToken: string }>().csrfToken;
    const hostMemberId = hostBootstrap.json<{
      snapshot: { hostMemberId: string };
    }>().snapshot.hostMemberId;
    const hostMediaCredential = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/credentials`,
      headers: {
        cookie: room.roomCookie,
        origin,
        "x-csrf-token": hostCsrf,
      },
      payload: { purpose: "whep" },
    });
    const scopedMedia = hostMediaCredential.json<{
      token: string;
      path: string;
    }>();
    const mediaConnected = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/mediamtx/auth",
      payload: {
        token: scopedMedia.token,
        action: "read",
        path: scopedMedia.path,
        id: "host-media-session",
      },
    });
    expect(mediaConnected.statusCode).toBe(204);

    const joined = await joinRoom(room.roomId, "Next Host");
    const joinedBody = joined.json<{
      member: { id: string };
      csrfToken: string;
    }>();
    const nextHostCookie = readCookie(joined, "sw_room");
    const handoff = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/host/handoff`,
      headers: {
        cookie: room.roomCookie,
        origin,
        "x-csrf-token": hostCsrf,
      },
      payload: { targetMemberId: joinedBody.member.id },
    });
    expect(handoff.statusCode).toBe(200);
    expect(handoff.json()).toMatchObject({
      hostMemberId: joinedBody.member.id,
      revision: 1,
    });

    const kicked = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/members/${hostMemberId}/kick`,
      headers: {
        cookie: nextHostCookie,
        origin,
        "x-csrf-token": joinedBody.csrfToken,
      },
      payload: { reason: "handoff complete" },
    });
    expect(kicked.statusCode).toBe(204);

    const revoked = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${room.roomId}/bootstrap`,
      headers: { cookie: room.roomCookie },
    });
    expect(revoked.statusCode).toBe(401);
    const mediaRevoked = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/mediamtx/auth",
      payload: {
        token: scopedMedia.token,
        action: "read",
        path: scopedMedia.path,
      },
    });
    expect(mediaRevoked.statusCode).toBe(403);
    const outbox = built.database
      .prepare("SELECT kind, state FROM service_outbox ORDER BY kind")
      .all() as Array<{ kind: string; state: string }>;
    expect(outbox).toEqual([
      { kind: "mediamtx.kick-sessions", state: "pending" },
      { kind: "rtc.remove-participant", state: "pending" },
    ]);

    const claims = [] as Array<{
      id: string;
      kind: string;
      leaseToken: string;
      payload: { memberId: string; sessionIds?: string[] };
    }>;
    for (let index = 0; index < 2; index += 1) {
      const claimed = await built.app.inject({
        method: "POST",
        url: "/api/v1/internal/outbox/claim",
        headers: { "x-internal-token": internalToken },
        payload: { workerId: "integration-worker" },
      });
      expect(claimed.statusCode).toBe(200);
      claims.push(claimed.json<(typeof claims)[number]>());
    }
    expect(new Set(claims.map((item) => item.id)).size).toBe(2);
    const mediaClaim = claims.find(
      (item) => item.kind === "mediamtx.kick-sessions",
    );
    expect(mediaClaim?.payload).toEqual({
      roomId: room.roomId,
      memberId: hostMemberId,
      sessionIds: ["host-media-session"],
    });

    const wrongLease = await built.app.inject({
      method: "POST",
      url: `/api/v1/internal/outbox/${claims[0]?.id}/complete`,
      headers: { "x-internal-token": internalToken },
      payload: { leaseToken: "wrong-lease" },
    });
    expect(wrongLease.statusCode).toBe(409);

    const rtcClaimIndex = claims.findIndex(
      (item) => item.kind === "rtc.remove-participant",
    );
    const rtcClaim = claims[rtcClaimIndex];
    expect(rtcClaim).toBeDefined();
    const failedAttempt = await built.app.inject({
      method: "POST",
      url: `/api/v1/internal/outbox/${rtcClaim?.id}/fail`,
      headers: { "x-internal-token": internalToken },
      payload: {
        leaseToken: rtcClaim?.leaseToken,
        error: "simulated downstream outage",
      },
    });
    expect(failedAttempt.statusCode).toBe(204);
    const retryState = built.database
      .prepare(
        "SELECT state, attempts, last_error FROM service_outbox WHERE id = ?",
      )
      .get(rtcClaim?.id) as {
      state: string;
      attempts: number;
      last_error: string | null;
    };
    expect(retryState).toEqual({
      state: "pending",
      attempts: 1,
      last_error: "simulated downstream outage",
    });
    built.database
      .prepare("UPDATE service_outbox SET not_before = ? WHERE id = ?")
      .run(fixedNow, rtcClaim?.id);
    const reclaimed = await built.app.inject({
      method: "POST",
      url: "/api/v1/internal/outbox/claim",
      headers: { "x-internal-token": internalToken },
      payload: { workerId: "restarted-worker" },
    });
    expect(reclaimed.statusCode).toBe(200);
    const retriedClaim = reclaimed.json<(typeof claims)[number]>();
    expect(retriedClaim.id).toBe(rtcClaim?.id);
    expect(retriedClaim.leaseToken).not.toBe(rtcClaim?.leaseToken);
    claims[rtcClaimIndex] = retriedClaim;

    for (const claim of claims) {
      const completed = await built.app.inject({
        method: "POST",
        url: `/api/v1/internal/outbox/${claim.id}/complete`,
        headers: { "x-internal-token": internalToken },
        payload: { leaseToken: claim.leaseToken },
      });
      expect(completed.statusCode).toBe(204);
    }
    const completedCount = built.database
      .prepare(
        "SELECT COUNT(*) AS count FROM service_outbox WHERE state = 'completed'",
      )
      .get() as { count: number };
    const closedMediaSession = built.database
      .prepare(
        "SELECT closed_at FROM media_transport_sessions WHERE mediamtx_session_id = ?",
      )
      .get("host-media-session") as { closed_at: number | null };
    expect(completedCount.count).toBe(2);
    expect(closedMediaSession.closed_at).toBe(fixedNow);
  });

  it("closes the room and revokes every room session", async () => {
    const admin = await loginAdmin();
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/rooms",
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: {
        password: "shared-room-password",
        hostNickname: "Host",
        maxMembers: 5,
      },
    });
    const roomId = created.json<{ room: { id: string } }>().room.id;
    const roomCookie = readCookie(created, "sw_room");
    const closed = await built.app.inject({
      method: "PATCH",
      url: `/api/v1/rooms/${roomId}`,
      headers: {
        cookie: admin.cookie,
        origin,
        "x-csrf-token": admin.csrfToken,
      },
      payload: { close: true },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toEqual({ id: roomId, status: "closed" });

    const bootstrap = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${roomId}/bootstrap`,
      headers: { cookie: roomCookie },
    });
    expect(bootstrap.statusCode).toBe(401);
  });

  it("authenticates WebSocket messages and returns clock/snapshot envelopes", async () => {
    const room = await createRoom();
    const socket = await built.app.injectWS(`/api/v1/rooms/${room.roomId}/ws`, {
      headers: {
        cookie: room.roomCookie,
        origin,
        "sec-websocket-protocol": "simplewatch.v1",
      },
    });

    const snapshotMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        type: "room.hello",
        id: uuidv7(),
        roomId: room.roomId,
        sentAtMs: fixedNow,
        payload: {},
      }),
    );
    expect(await snapshotMessage).toMatchObject({
      v: 1,
      type: "room.snapshot",
      roomId: room.roomId,
      payload: { revision: 0, mode: "idle" },
    });

    const pongMessage = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        type: "clock.ping",
        id: uuidv7(),
        roomId: room.roomId,
        sentAtMs: fixedNow,
        payload: { clientSentAtMs: fixedNow - 50 },
      }),
    );
    expect(await pongMessage).toMatchObject({
      type: "clock.pong",
      payload: {
        clientSentAtMs: fixedNow - 50,
        serverReceivedAtMs: fixedNow,
        serverSentAtMs: fixedNow,
      },
    });
    socket.close();
  });

  it("expires a disconnected host lease and transfers authority", async () => {
    const room = await createRoom();
    const joined = await joinRoom(room.roomId, "Oldest Member");
    const nextMemberId = joined.json<{ member: { id: string } }>().member.id;
    const hostIdentity = built.roomService.authenticate(
      cookieValue(room.roomCookie),
      room.roomId,
    );

    const snapshot = built.roomService.expireHostLease(hostIdentity, fixedNow);
    expect(snapshot).toMatchObject({
      hostMemberId: nextMemberId,
      revision: 1,
    });
  });

  it("rotates the shared password and optionally revokes existing members", async () => {
    const room = await createRoom();
    const joined = await joinRoom(room.roomId, "Existing Member");
    const memberCookie = readCookie(joined, "sw_room");
    const admin = built.database
      .prepare("SELECT id FROM admin_users")
      .get() as { id: string };

    await built.roomService.updateRoom(admin.id, room.roomId, {
      rotatePassword: "new-shared-room-password",
      revokeMembers: true,
    });

    const revoked = await built.app.inject({
      method: "GET",
      url: `/api/v1/rooms/${room.roomId}/bootstrap`,
      headers: { cookie: memberCookie },
    });
    expect(revoked.statusCode).toBe(401);

    const oldPassword = await joinRoom(room.roomId, "Old Password");
    expect(oldPassword.statusCode).toBe(401);
    const newPassword = await built.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${room.roomId}/join`,
      headers: { origin },
      payload: {
        nickname: "New Password",
        password: "new-shared-room-password",
      },
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it("refuses to start when an applied migration checksum changes", async () => {
    await built.app.close();
    const testRoot = temporaryRoots.at(-1);
    if (!testRoot) throw new Error("missing test root");
    const migrationCopy = join(testRoot, "migrations");
    mkdirSync(migrationCopy);
    const migration = readFileSync(
      resolve("migrations/001_initial.sql"),
      "utf8",
    );
    writeFileSync(join(migrationCopy, "001_initial.sql"), migration);
    const databasePath = join(testRoot, "checksum.sqlite3");
    const database = openDatabase({
      databasePath,
      migrationsPath: migrationCopy,
    });
    database.close();
    writeFileSync(
      join(migrationCopy, "001_initial.sql"),
      `${migration}\n-- changed`,
    );

    expect(() =>
      openDatabase({ databasePath, migrationsPath: migrationCopy }),
    ).toThrow("checksum 已改变");
    built = await buildApp({
      databasePath: join(testRoot, "replacement.sqlite3"),
      migrationsPath: resolve("migrations"),
      publicOrigin: origin,
    });
  });
});

async function loginAdmin(): Promise<{ cookie: string; csrfToken: string }> {
  const response = await built.app.inject({
    method: "POST",
    url: "/api/v1/admin/login",
    headers: { origin },
    payload: { username: "admin", password: "correct-horse-battery-staple" },
  });
  expect(response.statusCode).toBe(200);
  return {
    cookie: readCookie(response, "sw_admin"),
    csrfToken: response.json<{ csrfToken: string }>().csrfToken,
  };
}

async function createRoom(): Promise<{ roomId: string; roomCookie: string }> {
  const admin = await loginAdmin();
  const response = await built.app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { cookie: admin.cookie, origin, "x-csrf-token": admin.csrfToken },
    payload: {
      password: "shared-room-password",
      hostNickname: "Host",
      maxMembers: 5,
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    roomId: response.json<{ room: { id: string } }>().room.id,
    roomCookie: readCookie(response, "sw_room"),
  };
}

function joinRoom(roomId: string, nickname: string) {
  return built.app.inject({
    method: "POST",
    url: `/api/v1/rooms/${roomId}/join`,
    headers: { origin },
    payload: { nickname, password: "shared-room-password" },
  });
}

function readCookie(
  response: { headers: Record<string, string | string[] | number | undefined> },
  name: string,
): string {
  const header = response.headers["set-cookie"];
  const values = Array.isArray(header)
    ? header
    : typeof header === "string"
      ? [header]
      : [];
  const cookie = values.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`missing cookie ${name}`);
  return cookie.split(";", 1)[0] ?? "";
}

function cookieValue(cookie: string): string {
  return cookie.slice(cookie.indexOf("=") + 1);
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, rejectMessage) => {
    socket.once("error", rejectMessage);
    socket.once("message", (data: RawData) => {
      socket.off("error", rejectMessage);
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      resolveMessage(
        JSON.parse(bytes.toString("utf8")) as Record<string, unknown>,
      );
    });
  });
}
