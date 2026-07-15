import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const documentation = readFileSync(
  resolve("tests/docs/PREDEPLOY-TEST-CASES.md"),
  "utf8",
);
const tracking = readFileSync(
  resolve("tests/tracking/test-execution.csv"),
  "utf8",
);

const documentIds = [...documentation.matchAll(/^### (TC-P\d-\d{3})\b/gm)].map(
  (match) => match[1],
);
const trackingIds = tracking
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(",", 1)[0])
  .filter(Boolean);

const duplicateIds = (ids) =>
  [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
const documentOnly = [...new Set(documentIds)].filter(
  (id) => !trackingIds.includes(id),
);
const trackingOnly = [...new Set(trackingIds)].filter(
  (id) => !documentIds.includes(id),
);
const duplicates = [
  ...duplicateIds(documentIds).map((id) => `文档重复 ${id}`),
  ...duplicateIds(trackingIds).map((id) => `CSV 重复 ${id}`),
];

if (documentOnly.length || trackingOnly.length || duplicates.length) {
  for (const issue of [
    ...documentOnly.map((id) => `仅文档存在 ${id}`),
    ...trackingOnly.map((id) => `仅 CSV 存在 ${id}`),
    ...duplicates,
  ]) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`测试 ID 双向一致：${documentIds.length} 条，无重复`);
