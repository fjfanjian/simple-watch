import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { probeFile } from "../src/index.js";

import { execFileSync } from "node:child_process";

const outputDirectory = resolve("../../test-data/generated");
const outputPath = resolve(outputDirectory, "media-smoke.mp4");
mkdirSync(outputDirectory, { recursive: true });
rmSync(outputPath, { force: true });

execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=2",
    "-filter_complex",
    "[1:a][2:a]amerge=inputs=2[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ],
  { stdio: "inherit", windowsHide: true },
);

const result = await probeFile(outputPath);
if (!result.compatibility.compatible) {
  throw new Error(
    `生成的媒体样片不兼容：${result.compatibility.reasons.join("；")}`,
  );
}
console.log(
  JSON.stringify({ outputPath, compatibility: result.compatibility }, null, 2),
);
