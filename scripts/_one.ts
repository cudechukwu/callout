import { chromium } from "@playwright/test";
(async () => {
  const b = await chromium.launch(); const out = process.argv[2]!;
  for (const [tag, w, h, dpr] of [["desktop", 1440, 900, 1], ["laptop", 1329, 785, 1], ["phone", 390, 844, 2]] as const) {
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await page.goto("http://localhost:3460/"); await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/heropng-${tag}.png` });
  }
  await b.close();
})();
