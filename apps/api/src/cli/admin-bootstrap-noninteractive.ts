import { resolve, sep } from "node:path";

import { parseAppConfig } from "@simplewatch/config";

import { openDatabase } from "../database.js";
import { AuthService } from "../services/auth-service.js";

if (process.env.ALLOW_NONINTERACTIVE_BOOTSTRAP !== "true") {
  throw new Error("必须显式设置 ALLOW_NONINTERACTIVE_BOOTSTRAP=true");
}
const config = parseAppConfig(process.env);
if (config.nodeEnv === "production")
  throw new Error("生产环境禁止非交互初始化管理员");
const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!username || !password) throw new Error("缺少测试管理员凭据");
const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const allowedRoot = resolve(repositoryRoot, ".local");
const databasePath = resolve(config.databasePath);
if (!databasePath.startsWith(`${allowedRoot}${sep}`)) {
  throw new Error("非交互初始化仅允许写入仓库 .local 目录");
}

const database = openDatabase({ databasePath });
try {
  await new AuthService(database).bootstrapAdmin(username, password);
} finally {
  database.close();
}
