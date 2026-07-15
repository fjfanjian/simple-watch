import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database.js";
import { conflict, notFound } from "../errors.js";
import { createOpaqueToken, hashToken, verifyTokenHash } from "../security.js";

export type OutboxKind = "rtc.remove-participant" | "mediamtx.kick-sessions";

interface OutboxRow {
  readonly id: string;
  readonly kind: OutboxKind;
  readonly payload_json: string;
  readonly attempts: number;
  readonly lease_token_hash: string | null;
}

export class OutboxService {
  public constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  public claim(workerId: string) {
    const timestamp = this.now();
    return this.database
      .transaction(() => {
        const row = this.database
          .prepare(
            `SELECT id, kind, payload_json, attempts, lease_token_hash
           FROM service_outbox
           WHERE (state = 'pending' AND not_before <= ?)
              OR (state = 'leased' AND lease_until <= ?)
           ORDER BY created_at, id
           LIMIT 1`,
          )
          .get(timestamp, timestamp) as OutboxRow | undefined;
        if (!row) return null;
        const leaseToken = createOpaqueToken();
        const changed = this.database
          .prepare(
            `UPDATE service_outbox
           SET state = 'leased', attempts = attempts + 1, worker_id = ?,
               lease_token_hash = ?, lease_until = ?, last_error = NULL
           WHERE id = ? AND (
             (state = 'pending' AND not_before <= ?)
             OR (state = 'leased' AND lease_until <= ?)
           )`,
          )
          .run(
            workerId,
            hashToken(leaseToken),
            timestamp + 30_000,
            row.id,
            timestamp,
            timestamp,
          );
        if (changed.changes !== 1) return null;
        return {
          id: row.id,
          kind: row.kind,
          payload: JSON.parse(row.payload_json) as unknown,
          attempts: row.attempts + 1,
          leaseToken,
        };
      })
      .immediate();
  }

  public complete(id: string, leaseToken: string): void {
    const timestamp = this.now();
    this.database.transaction(() => {
      const row = this.requireLease(id, leaseToken);
      if (row.kind === "mediamtx.kick-sessions") {
        const payload = JSON.parse(row.payload_json) as {
          memberId?: unknown;
        };
        if (typeof payload.memberId === "string") {
          this.database
            .prepare(
              `UPDATE media_transport_sessions
               SET closed_at = ?
               WHERE member_id = ? AND closed_at IS NULL`,
            )
            .run(timestamp, payload.memberId);
        }
      }
      this.database
        .prepare(
          `UPDATE service_outbox
           SET state = 'completed', lease_until = NULL,
               lease_token_hash = NULL, completed_at = ?
           WHERE id = ?`,
        )
        .run(timestamp, id);
    })();
  }

  public fail(id: string, leaseToken: string, error: string): void {
    const row = this.requireLease(id, leaseToken);
    const delay = Math.min(5 * 60_000, 1000 * 2 ** Math.min(row.attempts, 8));
    this.database
      .prepare(
        `UPDATE service_outbox
         SET state = 'pending', not_before = ?, lease_until = NULL,
             lease_token_hash = NULL, last_error = ?
         WHERE id = ?`,
      )
      .run(this.now() + delay, error.slice(0, 1000), id);
  }

  public enqueueRemoveParticipant(
    roomId: string,
    memberId: string,
    dedupeKey = uuidv7(),
  ): void {
    const timestamp = this.now();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO service_outbox(
          id, kind, dedupe_key, payload_json, state, attempts,
          not_before, lease_until, last_error, created_at, completed_at,
          worker_id, lease_token_hash
        ) VALUES (?, 'rtc.remove-participant', ?, ?, 'pending', 0,
          ?, NULL, NULL, ?, NULL, NULL, NULL)`,
      )
      .run(
        uuidv7(),
        `rtc-remove:${dedupeKey}`,
        JSON.stringify({ roomId, memberId }),
        timestamp,
        timestamp,
      );
  }

  public enqueueIfRtcMemberInactive(
    roomId: string,
    memberId: string,
    dedupeKey: string,
  ): boolean {
    const active = this.database
      .prepare(
        `SELECT 1 FROM rooms r JOIN room_members m ON m.room_id = r.id
         WHERE r.id = ? AND m.member_id = ? AND r.status = 'active'
           AND m.left_at IS NULL AND m.kicked_at IS NULL`,
      )
      .get(roomId, memberId);
    if (active) return false;
    this.enqueueRemoveParticipant(roomId, memberId, dedupeKey);
    return true;
  }

  public getRtcReconciliationSnapshot(): Array<{
    roomId: string;
    activeMemberIds: string[];
  }> {
    const rows = this.database
      .prepare(
        `SELECT r.id AS room_id, m.member_id
         FROM rooms r
         LEFT JOIN room_members m ON m.room_id = r.id AND r.status = 'active'
           AND m.left_at IS NULL AND m.kicked_at IS NULL
         ORDER BY r.id, m.member_id`,
      )
      .all() as Array<{ room_id: string; member_id: string | null }>;
    const rooms = new Map<string, string[]>();
    for (const row of rows) {
      const members = rooms.get(row.room_id) ?? [];
      if (row.member_id) members.push(row.member_id);
      rooms.set(row.room_id, members);
    }
    return [...rooms].map(([roomId, activeMemberIds]) => ({
      roomId,
      activeMemberIds,
    }));
  }

  private requireLease(id: string, leaseToken: string): OutboxRow {
    const row = this.database
      .prepare(
        `SELECT id, kind, payload_json, attempts, lease_token_hash
         FROM service_outbox WHERE id = ? AND state = 'leased'`,
      )
      .get(id) as OutboxRow | undefined;
    if (!row) throw notFound("Outbox 任务不存在或未租用");
    if (
      !row.lease_token_hash ||
      !verifyTokenHash(leaseToken, row.lease_token_hash)
    ) {
      throw conflict("LEASE_MISMATCH", "Outbox lease token 不匹配");
    }
    return row;
  }
}
