import { test as base, expect } from "@playwright/test";
import { installApiMocks, type ApiLog } from "./api";
import { captureCloudViews } from "./in-page.mjs";
import { CloudPage } from "../pages/cloud";

type Fixtures = {
  api: ApiLog;
  cloud: CloudPage;
};

/**
 * `api` is automatic: every test in this project has `/api/ikolearn/**` mocked
 * before the first navigation. Ask for `cloud` when the test drives the home screen.
 */
export const test = base.extend<Fixtures>({
  api: [
    async ({ page }, use) => {
      await use(await installApiMocks(page));
    },
    { auto: true },
  ],
  cloud: async ({ page, api }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/Failed to load resource/.test(msg.text()))
        errors.push(msg.text());
    });
    await page.addInitScript(captureCloudViews);
    const cloud = new CloudPage(page, api, errors);
    await use(cloud);
    await testInfo.attach("api-calls.json", {
      body: JSON.stringify(
        { calls: api.calls, blocked: api.blocked, pageErrors: errors },
        null,
        2,
      ),
      contentType: "application/json",
    });
    if (testInfo.status === "passed" && api.blocked.length) {
      throw new Error(
        `offline harness contacted a live model host: ${api.blocked.join(", ")}`,
      );
    }
  },
});

export { expect };
