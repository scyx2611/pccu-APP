const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const account = process.env.PCCU_ACCOUNT;
const password = process.env.PCCU_PASSWORD;

if (!account || !password) {
  console.error('Missing PCCU_ACCOUNT or PCCU_PASSWORD');
  process.exit(1);
}

const outDir = path.join(__dirname, 'schedule-1208-debug');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function dumpFrame(frame, index) {
  const safeName = `frame-${String(index).padStart(2, '0')}`;
  const html = await frame.content().catch(() => '');
  const text = await frame
    .locator('body')
    .innerText()
    .catch(() => '');
  const tables = await frame
    .evaluate(() => {
      return Array.from(document.querySelectorAll('table')).map((table, tableIndex) => ({
        index: tableIndex,
        className: table.className || '',
        id: table.id || '',
        text: (table.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
        html: (table.outerHTML || '').slice(0, 2400),
      }));
    })
    .catch(() => []);

  fs.writeFileSync(path.join(outDir, `${safeName}.html`), html);
  fs.writeFileSync(path.join(outDir, `${safeName}.txt`), text);
  fs.writeFileSync(
    path.join(outDir, `${safeName}.json`),
    JSON.stringify(
      {
        url: frame.url(),
        tableCount: tables.length,
        tables,
      },
      null,
      2,
    ),
  );
}

async function run() {
  ensureDir(outDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  try {
    console.log('[1] login');
    await page.goto('https://ecampus.pccu.edu.tw/eCampus/default.aspx', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    const loginFrame =
      page.frames().find((frame) => frame.url().includes('ap1.pccu.edu.tw')) || page;
    await loginFrame.locator('input[id*="Account"]:visible').first().fill(account);
    await loginFrame.locator('input[id*="Password"]:visible').first().fill(password);
    await loginFrame.locator('input[id*="Password"]:visible').first().press('Enter');
    await page.waitForTimeout(8000);

    console.log('[2] open 1208');
    const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await page.evaluate(() => gfOpenLink('1208', 'service', '0', '00', '', ''));
    let popupPage = await popupPromise;

    if (!popupPage) {
      popupPage = page;
    }

    await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
    await popupPage.waitForTimeout(4000);

    console.log('[3] dump initial state');
    await popupPage.screenshot({ path: path.join(outDir, 'step-01-popup.png'), fullPage: true });

    console.log('[4] try student schedule tab');
    const studentTab = popupPage
      .locator('text=學生課表查詢')
      .or(popupPage.locator('text=學生課表'))
      .first();

    if (await studentTab.count()) {
      await studentTab.click().catch(async () => {
        await studentTab.evaluate((el) => el.click());
      });
      await popupPage.waitForTimeout(4000);
      await popupPage.screenshot({
        path: path.join(outDir, 'step-02-student-tab.png'),
        fullPage: true,
      });
    }

    console.log('[5] try search');
    const searchBtn = popupPage
      .locator(
        '#Search, input[type="submit"][value*="查詢"], input[type="button"][value*="查詢"], button:has-text("查詢")',
      )
      .first();
    if (await searchBtn.count()) {
      await searchBtn.click().catch(async () => {
        await searchBtn.evaluate((el) => el.click());
      });
      await popupPage.waitForTimeout(8000);
      await popupPage.screenshot({ path: path.join(outDir, 'step-03-search.png'), fullPage: true });
    }

    const summary = {
      popupUrl: popupPage.url(),
      frames: popupPage.frames().map((frame, index) => ({
        index,
        url: frame.url(),
        name: frame.name(),
      })),
    };

    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log('[6] dump frames');
    const frames = popupPage.frames();
    for (let i = 0; i < frames.length; i += 1) {
      await dumpFrame(frames[i], i);
    }

    console.log(`done: ${outDir}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
