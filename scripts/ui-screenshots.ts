/**
 * Walks the whole game in a real browser and saves a screenshot of each
 * screen — for reviewing the UI (desktop and phone width) without clicking
 * through by hand. Needs a running app: `npm run build && npx next start -p 3460`.
 *
 * Usage: npx tsx scripts/ui-screenshots.ts <outDir> [baseUrl]
 */
import { chromium, type Page } from "@playwright/test";

const outDir = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3460";
if (!outDir) throw new Error("usage: ui-screenshots.ts <outDir> [baseUrl]");

async function walk(page: Page, tag: string) {
  const shot = (name: string) => page.screenshot({ path: `${outDir}/${tag}-${name}.png` });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(base);
  await page.waitForTimeout(2600);
  await shot("01-landing");

  await page.goto(`${base}/draft`);
  await page.waitForSelector("h1");
  await page.waitForTimeout(900);
  await shot("02-draft-first-pick");

  for (let i = 0; i < 8; i++) {
    await page.locator("button[aria-label^='Pick ']").first().click();
    // a second click during the lock-in must be ignored, not double-pick
    await page.locator("button[aria-label^='Pick ']").nth(1).click({ force: true, timeout: 500 }).catch(() => {});
    if (i === 3) await shot("03-draft-midway");
    await page.waitForTimeout(1100);
  }

  await page.waitForSelector("#fighter-name");
  await page.fill("#fighter-name", "Nightshift");
  await shot("04-naming");
  await page.click("text=Reveal my fighter");
  await page.waitForTimeout(700);
  await shot("05-reveal-early");
  await page.waitForTimeout(3200);
  await shot("06-reveal-done");

  await page.click("text=Rampage: 20 fights");
  await page.waitForTimeout(1600);
  await shot("07-matchup");
  await page.click("text=Start fight");
  await page.waitForTimeout(4200);
  await shot("08-fight-live");
  await page.waitForSelector("text=Skip to result");
  await page.click("text=Skip to result");
  await page.waitForTimeout(700);
  await shot("09-result");

  await page.click("text=Next fight");
  await page.waitForTimeout(800);
  await page.click("text=Start fight");
  await page.click("text=Skip to result");
  await page.waitForTimeout(600);
  await page.locator("text=/Sim the remaining/").click();
  await page.waitForTimeout(1800);
  await shot("10-summary");

  console.log(`${tag}: done, ${errors.length} browser errors`);
  errors.slice(0, 5).forEach((e) => console.log("  ", e));
}

(async () => {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await walk(desktop, "desktop");
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await walk(phone, "phone");
  await browser.close();
})();
