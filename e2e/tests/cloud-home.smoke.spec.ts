import { test, expect } from "../fixtures/test";
import type { CloudPage } from "../pages/cloud";
import { Tag } from "../tags";

/**
 * Cloud-as-home happy path, ported from scripts/ikolearn-home-e2e.mjs.
 * Behavior only: where the learner lands, what Begin does, and that lesson and
 * deck return home. Layout measurements stay in the legacy script.
 * Age-band and family pages are not part of this suite.
 */
const widths = [
  { label: "desktop", width: 1280, height: 860 },
  { label: "phone", width: 390, height: 844 },
];

async function newLearnerGrowsCloud(cloud: CloudPage) {
  await cloud.open();
  await cloud.startAsSelf("Maya");

  const hi = ((await cloud.page.locator("#cs-hi").textContent()) || "").trim();
  const question = (
    (await cloud.page.locator("#cs-q").textContent()) || ""
  ).trim();
  const lede = `${hi} ${question}`;
  expect(lede).toBe(
    "Hi Maya. Let's begin your learning cloud together. What are you curious about, or what do you enjoy?",
  );
  expect(lede).not.toMatch(/\b(age|kids?|child|student|grade)\b/i);

  const landed = await cloud.screen();
  expect(landed.cloud).toBe(true);
  expect(landed.lesson).toBe(false);
  expect(landed.deck).toBe(false);
  expect(landed.start).toBe(true);
  expect(landed.flow).toBe(false);
  await expect(cloud.page.locator("#cs-name")).toHaveText("Maya");
  await expect(cloud.page.locator(".cloud-hint")).toBeHidden();
  await expect(cloud.page.locator("#cs-in")).not.toBeFocused();
  expect(cloud.api.paths()).toEqual([]);

  await cloud.begin("the ocean and drawing");
  await expect(cloud.page.locator("#cs-status")).toContainText(
    /Growing your cloud/,
  );
  await cloud.waitUntilCloudSettled(2);

  const grown = await cloud.screen();
  expect(grown.cloud).toBe(true);
  expect(grown.start).toBe(false);
  const thread = (await cloud.page.locator("#thread").textContent()) || "";
  expect(thread).toContain("the ocean and drawing");
  expect(thread).toContain("Here's where your path begins:");
  expect(thread).toContain("Ocean Life");
  expect(thread).toContain("Drawing");
  expect(cloud.api.paths()).toEqual(["/create"]);
  expect(cloud.errors).toEqual([]);
}

async function returningRoundTrip(cloud: CloudPage) {
  await cloud.seedReturning();

  const home = await cloud.screen();
  expect(home.cloud).toBe(true);
  expect(home.start).toBe(false);
  expect(home.flow).toBe(true);
  await expect(cloud.page.locator("#iko")).toHaveAttribute(
    "aria-label",
    "Talk to Iko",
  );
  await expect(cloud.page.locator("#cloud-deck")).toBeVisible();
  expect(cloud.api.paths()).toEqual([]);

  const lesson = await cloud.openFirstLesson();
  expect(lesson.chipText).toContain(lesson.title);
  await expect(cloud.page.locator("#l-body")).toContainText("melted rock");
  await expect(cloud.page.locator("#l-back")).toHaveText("Back to your cloud");
  await expect(
    cloud.page.getByRole("button", { name: "Open your learning cloud" }),
  ).toBeVisible();
  await expect(cloud.page.locator("#l-chat")).toHaveText("Ask Iko about this");
  expect((await cloud.screen()).cloud).toBe(false);

  await cloud.backFromLesson();
  const back = await cloud.screen();
  expect(back.cloud).toBe(true);
  expect(back.card).toBe(lesson.title);

  await cloud.closeCardIfOpen();
  const before = await cloud.camera();
  expect(before, "cloud view hook did not capture the camera").not.toBeNull();

  await cloud.openDeck();
  await expect(cloud.page.locator("#d-back")).toHaveText("Back to your cloud");
  expect((await cloud.screen()).deck).toBe(true);

  await cloud.backFromDeck();
  expect((await cloud.screen()).cloud).toBe(true);
  const after = await cloud.camera();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.zoom - before!.zoom)).toBeLessThan(1e-6);
  expect(Math.abs(after!.panX - before!.panX)).toBeLessThan(1);
  expect(Math.abs(after!.panY - before!.panY)).toBeLessThan(1);

  await cloud.page.keyboard.press("Escape");
  expect((await cloud.screen()).cloud).toBe(true);

  const paths = cloud.api.paths();
  expect(
    paths.filter((path) => path !== "/lesson" && path !== "/check"),
  ).toEqual([]);
  expect(
    paths.filter((path) => path === "/lesson").length,
  ).toBeGreaterThanOrEqual(1);
  expect(paths.filter((path) => path === "/lesson").length).toBeLessThanOrEqual(
    2,
  );
  expect(cloud.errors).toEqual([]);
}

for (const vp of widths) {
  test.describe(`cloud as home (${vp.label}) ${Tag.smoke}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("a new learner lands on an empty cloud and Begin grows it in place", async ({
      cloud,
    }) => {
      await newLearnerGrowsCloud(cloud);
    });

    test("a returning visit opens on the cloud, and lesson and deck come back home", async ({
      cloud,
    }) => {
      await returningRoundTrip(cloud);
    });
  });
}
