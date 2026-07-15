import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";

import { probeFile } from "@simplewatch/media";

export interface ProbeJobPayload {
  readonly uploadId?: string | undefined;
  readonly filePath: string;
  readonly storageKey: string;
  readonly source?: "sftp" | undefined;
}

export interface MediaWorkerRoots {
  readonly uploadRoot: string;
  readonly mediaRoot: string;
  readonly inboxRoot: string;
  readonly subtitleRoot: string;
}

export async function processProbeJob(
  payload: ProbeJobPayload,
  roots: MediaWorkerRoots,
  ffprobePath = "ffprobe",
) {
  const sourceRoot =
    payload.source === "sftp" ? roots.inboxRoot : roots.uploadRoot;
  const source = requireLexicalPathWithin(payload.filePath, sourceRoot);
  const before = statSync(source);
  if (!before.isFile()) throw new Error("上传结果不是普通文件");

  const [{ probe, compatibility }, sha256] = await Promise.all([
    probeFile(source, ffprobePath),
    hashFile(source),
  ]);
  const destinationRoot = compatibility.compatible
    ? roots.mediaRoot
    : roots.inboxRoot;
  const destinationDirectory = join(destinationRoot, payload.storageKey);
  mkdirSync(destinationDirectory, { recursive: true });
  const finalPath = join(
    destinationDirectory,
    compatibility.compatible ? "content.mp4" : basename(source),
  );
  moveFile(source, finalPath);

  return {
    compatible: compatibility.compatible,
    probe,
    reasons: compatibility.reasons,
    sha256,
    bytes: before.size,
    durationMs: compatibility.durationMs,
    finalPath: resolve(finalPath),
  };
}

interface MoveOperations {
  readonly rename: (source: string, destination: string) => void;
  readonly copy: (source: string, destination: string) => void;
  readonly unlink: (path: string) => void;
  readonly remove: (path: string) => void;
}

const defaultMoveOperations: MoveOperations = {
  rename: renameSync,
  copy: copyFileSync,
  unlink: unlinkSync,
  remove: (path) => rmSync(path, { force: true }),
};

export function moveFile(
  source: string,
  destination: string,
  operations: MoveOperations = defaultMoveOperations,
) {
  try {
    operations.rename(source, destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }

  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    operations.copy(source, temporary);
    operations.rename(temporary, destination);
    operations.unlink(source);
  } catch (error) {
    operations.remove(temporary);
    throw error;
  }
}

export function processSubtitleJob(
  payload: {
    readonly storageKey: string;
    readonly contentBase64: string;
  },
  subtitleRoot: string,
) {
  const content = Buffer.from(payload.contentBase64, "base64");
  if (content.length === 0 || content.length > 2 * 1024 * 1024) {
    throw new Error("字幕大小无效");
  }
  mkdirSync(subtitleRoot, { recursive: true });
  const finalPath = resolve(subtitleRoot, `${payload.storageKey}.vtt`);
  writeFileSync(finalPath, content, { flag: "wx" });
  return {
    finalPath,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function requireLexicalPathWithin(path: string, root: string): string {
  const absoluteRoot = resolve(root);
  const absolute = resolve(path);
  if (
    absolute !== absoluteRoot &&
    !absolute.startsWith(`${absoluteRoot}${sep}`)
  ) {
    throw new Error("文件路径超出上传目录");
  }
  return absolute;
}
