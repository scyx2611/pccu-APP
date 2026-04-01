const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function fetchFullGrades() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  
  const studentId = process.env.PCCU_ID || '[REDACTED_ID]';
  const password = process.env.PCCU_PASSWORD || '[REDACTED_PASSWORD]';

  try {
    console.log('=== [1] 登入 ===');
    await page.goto('https://ecampus.pccu.edu.tw/eCampus/default.aspx');
    await page.waitForTimeout(3000);
    
    const loginFrame = page.frames().find(f => f.url().includes('ap1.pccu.edu.tw')) || page;
    await loginFrame.locator('input[id*="Account"]:visible').first().click();
    await page.keyboard.type(studentId, { delay: 50 });
    await loginFrame.locator('input[id*="Password"]:visible').first().click();
    await page.keyboard.type(password, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);
    
    console.log('URL after login:', page.url());
    await page.screenshot({ path: path.join(__dirname, 'debug_01_login.png'), fullPage: true });

    console.log('=== [2] 等待 Inside 頁面載入 ===');
    await page.waitForTimeout(3000);

    console.log('=== [3] 呼叫 gfOpenLink 打開成績視窗 ===');
    // 等待 gfOpenLink 可用
    await page.waitForFunction(() => typeof gfOpenLink === 'function', { timeout: 15000 });
    console.log('gfOpenLink 可用');
    
    // 監聽新頁面
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => gfOpenLink("1220", "service", "0", "00", "", ""));
    
    let popupPage;
    try {
      popupPage = await popupPromise;
      console.log('Popup 開啟:', popupPage.url());
    } catch (e) {
      console.log('無法捕獲 Popup，嘗試在原頁面操作');
      popupPage = page;
    }
    
    await popupPage.waitForTimeout(3000);
    await popupPage.screenshot({ path: path.join(__dirname, 'debug_02_popup.png'), fullPage: true });

    console.log('=== [4] 點擊「歷年成績單」 ===');
    const historyTab = popupPage.locator('text="歷年成績單"').first();
    if (await historyTab.count() > 0) {
      console.log('點擊歷年成績單...');
      await historyTab.click();
      await popupPage.waitForTimeout(4000);
      await popupPage.screenshot({ path: path.join(__dirname, 'debug_03_tab.png'), fullPage: true });
    }

    console.log('=== [5] 點擊「查詢」 ===');
    const queryBtn = popupPage.locator('#Search, input[value*="查詢"]').first();
    if (await queryBtn.count() > 0) {
      console.log('點擊查詢...');
      await queryBtn.click();
      await popupPage.waitForTimeout(8000);
      await popupPage.screenshot({ path: path.join(__dirname, 'debug_04_query.png'), fullPage: true });
    }

    console.log('=== [6] 擷取數據 ===');
    let result = '';
    
    // 在所有 frames 中找
    for (let i = 0; i < popupPage.frames().length; i++) {
      const f = popupPage.frames()[i];
      try {
        const frameUrl = f.url();
        const data = await f.evaluate(() => {
          const tables = document.querySelectorAll('table');
          const out = [];
          tables.forEach((t, idx) => {
            if (t.innerText.length > 100) {
              out.push(`【Table ${idx}】\n${t.innerText}`);
            }
          });
          return out.join('\n\n');
        });
        if (data && data.length > 100) {
          result += `\n=== Frame ${i}: ${frameUrl} ===\n${data}\n`;
        }
      } catch (e) {
        console.log('Frame', i, 'error:', e.message);
      }
    }

    // 備用：直接抓 body
    if (!result || result.length < 500) {
      result = await popupPage.evaluate(() => document.body.innerText);
    }

    console.log('數據長度:', result.length);
    fs.writeFileSync(path.join(__dirname, 'grades_result.txt'), result);
    console.log('已存到 grades_result.txt');
    
    await popupPage.screenshot({ path: path.join(__dirname, 'debug_05_final.png'), fullPage: true });

    console.log('=== 完成 ===');

  } catch (error) {
    console.error('錯誤:', error.message);
    try {
      await page.screenshot({ path: path.join(__dirname, 'error.png') });
    } catch {}
  } finally {
    await browser.close();
  }
}

fetchFullGrades();
