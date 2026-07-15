import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const planPath = resolve("IMPLEMENTATION_PLAN.md");
const plan = readFileSync(planPath, "utf8");
const forbiddenPatterns = [
  ["他人用户目录", /\/Users\/simplechen/],
  ["macOS Conda 锁文件", /conda-osx-arm64\.lock/],
  ["示例密码", /(?:password|passwd)\s*[=:]\s*(?:changeme|password|123456)/i],
  ["latest 镜像标签", /image:\s*\S+:latest\b/],
];

const failures = forbiddenPatterns
  .filter(([, pattern]) => pattern.test(plan))
  .map(([name]) => `计划仍包含：${name}`);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("计划环境占位符检查通过");
