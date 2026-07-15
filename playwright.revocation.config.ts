import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config.js";

export default defineConfig({
  ...baseConfig,
  testDir: "tests/revocation-e2e",
  workers: 1,
});
