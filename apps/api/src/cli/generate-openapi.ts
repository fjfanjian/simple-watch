import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import { buildApp } from "../app.js";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const outputPath = resolve(repoRoot, "docs/openapi.yaml");
const { app } = await buildApp({
  databasePath: ":memory:",
  migrationsPath: resolve(repoRoot, "migrations"),
  publicOrigin: "https://watch.simplec.top",
});

try {
  const rendered = stringify(app.swagger(), { lineWidth: 0 });
  if (process.argv.includes("--check")) {
    const existing = readFileSync(outputPath, "utf8");
    if (existing !== rendered) {
      console.error(
        "docs/openapi.yaml 与当前 Zod 路由不一致，请运行 pnpm openapi:generate",
      );
      process.exitCode = 1;
    } else {
      console.log("OpenAPI 文档与路由契约一致");
    }
  } else {
    writeFileSync(outputPath, rendered, "utf8");
    console.log(`已生成 ${outputPath}`);
  }
} finally {
  await app.close();
}
