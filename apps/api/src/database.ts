import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

import Database from "better-sqlite3";

interface MigrationRow {
  readonly version: string;
  readonly checksum: string;
}

export type AppDatabase = Database.Database;

export interface OpenDatabaseOptions {
  readonly databasePath: string;
  readonly migrationsPath?: string;
  readonly now?: () => number;
}

export function openDatabase(options: OpenDatabaseOptions): AppDatabase {
  const database = new Database(options.databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("wal_autocheckpoint = 1000");

  try {
    runMigrations(
      database,
      options.migrationsPath ?? resolve(process.cwd(), "migrations"),
      options.now ?? Date.now,
    );
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
}

export function runMigrations(
  database: AppDatabase,
  migrationsPath: string,
  now: () => number,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const files = readdirSync(migrationsPath)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));
  const selectMigration = database.prepare(
    "SELECT version, checksum FROM schema_migrations WHERE version = ?",
  );
  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)",
  );

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsPath, file), "utf8");
    const version = basename(file, ".sql").split("_")[0];
    if (!version) throw new Error(`无效迁移文件名：${file}`);

    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = selectMigration.get(version) as MigrationRow | undefined;
    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`迁移 ${version} 的 checksum 已改变，拒绝启动`);
      }
      continue;
    }

    database.transaction(() => {
      database.exec(sql);
      insertMigration.run(version, checksum, now());
    })();
  }
}
