import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function isWithinRepo(path) {
  const pathFromRoot = relative(realpathSync(repoRoot), realpathSync(path));
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`);
}

const nodeMajor = Number.parseInt(
  process.versions.node.split(".")[0] ?? "0",
  10,
);
assert(nodeMajor === 24, `Node 必须为 24.x，当前为 ${process.versions.node}`);

const packageManagerMatch = /\bpnpm\/(\d+\.\d+\.\d+)\b/.exec(
  process.env.npm_config_user_agent ?? "",
);
const pnpmVersion = packageManagerMatch?.[1] ?? "unavailable";
assert(
  pnpmVersion.startsWith("10."),
  `pnpm 必须为 10.x，当前为 ${pnpmVersion}`,
);

for (const path of [".cache", ".conda", "tmp"]) {
  const absolutePath = join(repoRoot, path);
  if (existsSync(absolutePath))
    assert(isWithinRepo(absolutePath), `${path} 必须位于仓库内`);
}

const condaPrefix = process.env.CONDA_PREFIX;
assert(Boolean(condaPrefix), "必须通过项目 Conda 环境运行 env:check");
if (condaPrefix && existsSync(condaPrefix)) {
  assert(isWithinRepo(condaPrefix), `Conda prefix 越界：${condaPrefix}`);
}

const lockFile = join(repoRoot, "conda-win-64.lock");
assert(
  existsSync(lockFile) && statSync(lockFile).size > 0,
  "缺少 conda-win-64.lock",
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`环境检查通过：Node ${process.versions.node}，pnpm ${pnpmVersion}`);
