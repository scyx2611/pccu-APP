const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function analyzeTable() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  const studentId = 'B4218448';
  const password = 'Tsai261001';

  try {
    console.log('[1] 登入');
    await page.goto('https://ecampus.pccu.edu.tw/eCampus/default.aspx?UserType=&LangType=');
    await page.waitForTimeout(2000);
    
    const loginFrame = page.frames().find(f => f.url().includes('ap1.pccu.edu.tw')) || page;
    await loginFrame.locator('input[id*="Account"]:visible').first().click();
    await page.keyboard.type(studentId, { delay: 50 });
    await loginFrame.locator('input[id*="Password"]:visible').first().click();
    await page.keyboard.type(password, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);

    console.log('[2] 開啟成績視窗');
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.evaluate(() => gfOpenLink("1220", "service", "0", "00", "", ""));
    const popupPage = await popupPromise;
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(3000);

    console.log('[3] 點擊歷年成績單');
    const historyTab = popupPage.locator('text="歷年成績單"').first();
    if (await historyTab.count() > 0) {
        await historyTab.evaluate(el => el.click());
        await popupPage.waitForTimeout(3000);
    }

    console.log('[4] 點擊查詢');
    const queryBtn = popupPage.locator('#Search, input[value*="查詢"]').first();
    if (await queryBtn.count() > 0) {
        await queryBtn.evaluate(el => el.click());
        await popupPage.waitForTimeout(6000);
    }

    console.log('[5] 分析表格結構...');
    
    let result = '=== 表格分析報告 ===\n\n';
    
    for (let i = 0; i < popupPage.frames().length; i++) {
      const f = popupPage.frames()[i];
      const frameUrl = f.url();
      
      result += `\n【Frame ${i}】${frameUrl}\n`;
      result += '-'.repeat(50) + '\n';
      
      try {
        // 方法1: 標準 DOM query
        const domData = await f.evaluate(() => {
          const out = [];
          
          // 所有 table
          document.querySelectorAll('table').forEach((t, ti) => {
            const html = t.outerHTML.substring(0, 2000);
            out.push(`[Table ${ti}] HTML前2000字:\n${html}\n`);
          });
          
          // 所有 frame/iframe
          document.querySelectorAll('frame, iframe').forEach((fr, fi) => {
            out.push(`[Frame/iframe ${fi}] name=${fr.name} id=${fr.id} src=${fr.src}\n`);
          });
          
          return out.join('\n');
        });
        
        result += `DOM分析:\n${domData}\n`;
        
        // 方法2: 直接取 innerHTML
        const htmlData = await f.evaluate(() => {
          return document.body.innerHTML.substring(0, 3000);
        });
        result += `\nBody HTML 前3000字:\n${htmlData}\n`;
        
      } catch (e) {
        result += `錯誤: ${e.message}\n`;
      }
    }

    // 存檔
    fs.writeFileSync(path.join(__dirname, 'table_analysis.txt'), result);
    console.log('分析完成，存到 table_analysis.txt');
    
    // 截圖
    await popupPage.screenshot({ path: path.join(__dirname, 'table_screen.png'), fullPage: true });

  } catch (error) {
    console.error('錯誤:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeTable();
