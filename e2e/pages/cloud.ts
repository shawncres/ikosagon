import type { Page } from "@playwright/test";
import type { ApiLog } from "../fixtures/api";
import {
  cloudSettled,
  readCamera,
  readScreen,
  seedReturningLearner,
  type CameraState,
  type ScreenState,
} from "../fixtures/in-page.mjs";

/**
 * Thin wrapper around the IkoLearn home screen (the cloud).
 * Selectors are the ids already in public/ikolearn/index.html.
 */
export class CloudPage {
  constructor(
    readonly page: Page,
    readonly api: ApiLog,
    readonly errors: string[],
  ) {}

  async open() {
    await this.page.goto("./");
    await this.page.locator('.who-opt[data-who="self"]').waitFor();
  }

  /** Learning for yourself: first name, then the empty cloud. Age chips are skipped only if they are actually shown. */
  async startAsSelf(name: string) {
    await this.page.locator('.who-opt[data-who="self"]').click();
    const input = this.page.locator("#name-in");
    await input.waitFor({ state: "visible" });
    await input.fill(name);
    await input.press("Enter");
    await this.page.locator("#cloud:not([hidden])").waitFor();
    const skip = this.page.locator("#cs-age-skip");
    if (await skip.isVisible()) await skip.click();
  }

  async begin(text: string) {
    await this.page.locator("#cs-in").fill(text);
    await this.page.locator('#cs-form button[type="submit"]').click();
  }

  /** Load the app, write Maya's saved cloud, reload so the app boots from localStorage. */
  async seedReturning() {
    await this.open();
    await this.page.evaluate(seedReturningLearner);
    await this.page.reload();
    await this.page.locator("#cloud:not([hidden])").waitFor();
  }

  screen(): Promise<ScreenState> {
    return this.page.evaluate(readScreen);
  }

  camera(): Promise<CameraState | null> {
    return this.page.evaluate(readCamera);
  }

  waitUntilCloudSettled(minSubjects = 2) {
    return this.page.waitForFunction(cloudSettled, minSubjects, {
      timeout: 20_000,
    });
  }

  async openFirstLesson() {
    const chip = this.page.locator(".cloud-flow > .chip").first();
    await chip.waitFor();
    const chipText = ((await chip.textContent()) || "").trim();
    await chip.click();
    await this.page.locator("#lesson:not([hidden])").waitFor();
    await this.page.locator("#l-title").waitFor();
    const title = (
      (await this.page.locator("#l-title").textContent()) || ""
    ).trim();
    return { chipText, title };
  }

  /**
   * The "Back to your cloud" link is hidden while the cloud thumbnail sits in the header.
   * That thumbnail is the control a learner actually presses. Escape runs the hidden link.
   */
  async backFromLesson() {
    await this.page
      .getByRole("button", { name: "Open your learning cloud" })
      .click();
    await this.page
      .locator("#cloud:not([hidden])")
      .waitFor({ timeout: 10_000 });
    await this.page.locator("#panel:not([hidden])").waitFor();
  }

  async closeCardIfOpen() {
    const panel = this.page.locator("#panel");
    if (await panel.isVisible()) await this.page.locator("#p-close").click();
    await panel.waitFor({ state: "hidden" });
  }

  async openDeck() {
    await this.page.locator("#cloud-deck").click();
    await this.page.locator("#deck:not([hidden])").waitFor();
  }

  async backFromDeck() {
    await this.page
      .getByRole("button", { name: "Open your learning cloud" })
      .click();
    await this.page.locator("#cloud:not([hidden])").waitFor();
  }
}
