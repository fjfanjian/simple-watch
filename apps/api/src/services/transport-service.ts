import { TextEncoder } from "node:util";

import { jwtVerify, SignJWT } from "jose";
import {
  AccessToken,
  TrackSource,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import type { AppDatabase } from "../database.js";
import { forbidden, unauthorized } from "../errors.js";
import { createOpaqueToken, hashToken } from "../security.js";
import type { RoomIdentity } from "./room-service.js";

interface TransportOptions {
  readonly mediaJwtSecret: string;
  readonly mediaOrigin: string;
  readonly livekitApiKey: string;
  readonly livekitApiSecret: string;
  readonly livekitUrl: string;
  readonly now?: () => number;
}

const mediaClaimsSchema = z.object({
  roomId: z.string().uuid(),
  sub: z.string().uuid(),
  action: z.enum(["read", "publish"]),
  path: z.string().min(1),
  jti: z.string().min(1),
});

export class TransportService {
  private readonly now: () => number;
  private readonly mediaKey: Uint8Array;
  private readonly webhookReceiver: WebhookReceiver;

  public constructor(
    private readonly database: AppDatabase,
    private readonly options: TransportOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.mediaKey = new TextEncoder().encode(options.mediaJwtSecret);
    this.webhookReceiver = new WebhookReceiver(
      options.livekitApiKey,
      options.livekitApiSecret,
    );
  }

  public async receiveLivekitWebhook(
    body: string,
    authorization?: string,
  ): Promise<WebhookEvent> {
    try {
      return await this.webhookReceiver.receive(body, authorization);
    } catch {
      throw unauthorized("LiveKit webhook 签名无效");
    }
  }

  public async issueCredential(
    identity: RoomIdentity,
    purpose: "voice" | "whep",
  ) {
    this.requireActiveMember(identity.roomId, identity.memberId);
    if (purpose === "voice") {
      const token = new AccessToken(
        this.options.livekitApiKey,
        this.options.livekitApiSecret,
        {
          identity: identity.memberId,
          name: identity.nickname,
          ttl: "5m",
          metadata: JSON.stringify({ roomId: identity.roomId }),
        },
      );
      token.addGrant({
        room: `voice:${identity.roomId}`,
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
      });
      return {
        purpose,
        url: this.options.livekitUrl,
        token: await token.toJwt(),
        expiresAt: new Date(this.now() + 5 * 60_000).toISOString(),
      };
    }

    const path = this.getLivePath(identity.roomId);
    return this.issueMediaToken(identity, "read", path, 5 * 60_000, purpose);
  }

  public async issuePublishCredential(identity: RoomIdentity) {
    if (identity.role !== "host") throw forbidden("只有主持人可以推流");
    this.requireActiveMember(identity.roomId, identity.memberId);
    const path = this.getLivePath(identity.roomId);
    return this.issueMediaToken(
      identity,
      "publish",
      path,
      6 * 60 * 60_000,
      "whip",
    );
  }

  public async authorizeMedia(input: {
    readonly token?: string | undefined;
    readonly action: string;
    readonly path: string;
    readonly id?: string | undefined;
  }): Promise<void> {
    if (!input.token) throw unauthorized("缺少媒体凭据");
    let payload: z.infer<typeof mediaClaimsSchema>;
    try {
      const verified = await jwtVerify(input.token, this.mediaKey, {
        issuer: "simplewatch",
        audience: "mediamtx",
        currentDate: new Date(this.now()),
      });
      payload = mediaClaimsSchema.parse(verified.payload);
    } catch {
      throw unauthorized("媒体凭据无效或已过期");
    }
    const { roomId, sub: memberId, action, path, jti } = payload;
    if (action !== input.action || path !== input.path) {
      throw forbidden("媒体 action/path 与凭据不匹配");
    }
    this.requireActiveMember(roomId, memberId);
    const tokenRow = this.database
      .prepare(
        "SELECT revoked_at FROM token_jti WHERE jti_hash = ? AND kind = 'media' AND expires_at > ?",
      )
      .get(hashToken(jti), this.now()) as
      | { readonly revoked_at: number | null }
      | undefined;
    if (!tokenRow || tokenRow.revoked_at !== null)
      throw forbidden("媒体凭据已撤销");

    if (input.id) {
      const exists = this.database
        .prepare(
          "SELECT 1 FROM media_transport_sessions WHERE jti_hash = ? AND mediamtx_session_id = ? AND closed_at IS NULL",
        )
        .get(hashToken(jti), input.id);
      if (!exists) {
        this.database
          .prepare(
            `INSERT INTO media_transport_sessions(
              id, room_id, member_id, jti_hash, mediamtx_session_id,
              action, path, connected_at, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          )
          .run(
            uuidv7(),
            roomId,
            memberId,
            hashToken(jti),
            input.id,
            action,
            path,
            this.now(),
          );
      }
    }
  }

  private async issueMediaToken(
    identity: RoomIdentity,
    action: "read" | "publish",
    path: string,
    ttlMs: number,
    purpose: "whep" | "whip",
  ) {
    const jti = createOpaqueToken(24);
    const expiresAt = this.now() + ttlMs;
    const token = await new SignJWT({
      roomId: identity.roomId,
      action,
      path,
    })
      .setProtectedHeader({ alg: "HS256", kid: "local-v1", typ: "JWT" })
      .setIssuer("simplewatch")
      .setAudience("mediamtx")
      .setSubject(identity.memberId)
      .setJti(jti)
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.mediaKey);
    this.database
      .prepare(
        `INSERT INTO token_jti(jti_hash, kind, subject_id, expires_at, revoked_at)
         VALUES (?, 'media', ?, ?, NULL)`,
      )
      .run(hashToken(jti), identity.memberId, expiresAt);
    return {
      purpose,
      url: `${this.options.mediaOrigin}/program/${path}/${purpose}`,
      token,
      path,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private getLivePath(roomId: string): string {
    const state = this.database
      .prepare("SELECT live_path FROM room_state WHERE room_id = ?")
      .get(roomId) as { readonly live_path: string | null } | undefined;
    if (!state?.live_path) throw forbidden("房间直播路径不可用");
    return state.live_path;
  }

  private requireActiveMember(roomId: string, memberId: string): void {
    const row = this.database
      .prepare(
        `SELECT 1 FROM room_members m JOIN rooms r ON r.id = m.room_id
         WHERE m.room_id = ? AND m.member_id = ? AND r.status = 'active'
           AND m.left_at IS NULL AND m.kicked_at IS NULL`,
      )
      .get(roomId, memberId);
    if (!row) throw forbidden("房间成员状态无效");
  }
}
