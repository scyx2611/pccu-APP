import * as cheerio from 'cheerio';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import iconv from 'iconv-lite';

const API_BASE_URL = 'https://ecampus.pccu.edu.tw/eCampus';

export interface CourseData {
  name: string;
  teacher: string;
  location: string;
  required: boolean;
  type: string;
  dayOfWeek: number;
  periodRange: string;
  startPeriod: number;
  endPeriod: number;
}

// Cookie jar 工具
function createCookieJar() {
  let jar = '';
  return {
    get: () => jar,
    merge: (setCookieHeader: string | null | undefined) => {
      if (!setCookieHeader) return;
      const newParts = setCookieHeader.split(',').map(c => c.split(';')[0].trim()).filter(Boolean);
      if (newParts.length > 0) {
        jar = jar ? jar + '; ' + newParts.join('; ') : newParts.join('; ');
      }
    }
  };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeHtml(buffer: ArrayBuffer): string {
  const buf = Buffer.from(buffer);
  let text = buf.toString('utf8');
  if (text.includes('�') || text.includes('¤')) {
    try { text = iconv.decode(buf, 'Big5'); } catch { /* keep utf8 */ }
  }
  return text;
}

/**
 * 登入並獲取課表
 */
export const fetchScheduleWithCredentials = async (
  account: string,
  password: string,
  yearTerm: string = '1142'
): Promise<{ success: boolean; data?: CourseData[]; message?: string }> => {
  try {
    const cookies = createCookieJar();

    // ============ 步驟 1: 登入 ecampus ============
    console.log('=== [課表流程] 步驟 1: 登入 ecampus ===');

    const loginRes = await fetch(API_BASE_URL + '/default.aspx/gfChkLogin', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        Account: account,
        Password: password,
        SwitchUserId: '',
        UserRole: 'student',
        LangType: 'zh-TW',
        Switch: false,
      }),
    });

    cookies.merge(loginRes.headers.get('set-cookie'));

    const loginData = await loginRes.json();
    if (!loginData?.d || loginData.d.HasError !== false) {
      return { success: false, message: '登入失敗：' + (loginData?.d?.MessageKey || '帳號密碼錯誤') };
    }

    console.log('[課表流程] ecampus 登入成功');
    console.log('[課表流程] Cookie:', cookies.get().substring(0, 80) + '...');

    // ============ 步驟 2: 訪問 inside.aspx 建立完整 session ============
    console.log('=== [課表流程] 步驟 2: 訪問 inside.aspx ===');

    const insideRes = await fetch(API_BASE_URL + '/inside.aspx', {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Cookie': cookies.get(),
        'Referer': API_BASE_URL + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    cookies.merge(insideRes.headers.get('set-cookie'));
    const insideHtml = decodeHtml(await insideRes.arrayBuffer());
    console.log('[課表流程] inside.aspx 長度:', insideHtml.length);

    // 診斷：列出 inside.aspx 中所有 script src
    const $inside = cheerio.load(insideHtml);
    const scriptSrcs: string[] = [];
    $inside('script').each((_i, el) => {
      const src = $inside(el).attr('src');
      if (src) scriptSrcs.push(src);
    });
    console.log('[課表流程] Script 檔案:', scriptSrcs.length);
    scriptSrcs.forEach(s => console.log('  →', s));

    // 診斷：列出所有 a 連結
    const allLinks: string[] = [];
    $inside('a').each((_i, el) => {
      const href = $inside(el).attr('href') || '';
      const text = $inside(el).text().trim();
      if (href && href !== '#' && href !== 'javascript:void(0)') {
        allLinks.push(`[${text.substring(0, 20)}] → ${href.substring(0, 80)}`);
      }
    });
    console.log('[課表流程] 所有連結 (' + allLinks.length + '):');
    allLinks.forEach(l => console.log('  ', l));

    // 診斷：找 inline JS 中的 URL
    const allUrls = insideHtml.match(/https?:\/\/[^\s"'<>)]+/g) || [];
    const uniqueUrls = [...new Set(allUrls)];
    console.log('[課表流程] HTML 中所有 URL (' + uniqueUrls.length + '):');
    uniqueUrls.forEach(u => console.log('  →', u));

    // ============ 步驟 3: 呼叫 gfGetMyFunctionList API ============
    console.log('=== [課表流程] 步驟 3: gfGetMyFunctionList ===');

    let functionListLinks: string[] = [];
    try {
      const funcRes = await fetch(API_BASE_URL + '/Inside.aspx/gfGetMyFunctionList', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Cookie': cookies.get(),
          'Content-Type': 'application/json; charset=utf-8',
          'Referer': API_BASE_URL + '/inside.aspx',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
        body: '{}',
      });

      console.log('[課表流程] gfGetMyFunctionList 狀態:', funcRes.status);
      cookies.merge(funcRes.headers.get('set-cookie'));

      if (funcRes.status === 200) {
        const funcData = await funcRes.json();
        const funcHtml = funcData?.d || '';
        console.log('[課表流程] 回應 d 長度:', funcHtml.length);
        console.log('[課表流程] 回應 d 前300字:', String(funcHtml).substring(0, 300));

        // 從回應 HTML 中找連結
        if (funcHtml) {
          const $func = cheerio.load(String(funcHtml));
          $func('a').each((_i: number, el: any) => {
            const href = $func(el).attr('href') || '';
            const text = $func(el).text().trim();
            if (href && (href.includes('ap1') || href.includes('ap2') || href.includes('query') || href.includes('course'))) {
              console.log('[課表流程] 功能連結:', `[${text}] → ${href}`);
              functionListLinks.push(href);
            }
          });

          // 也從純文字中找連結
          const funcUrls = String(funcHtml).match(/https?:\/\/[^\s"'<>)]+/g) || [];
          funcUrls.forEach(u => {
            if ((u.includes('ap1') || u.includes('ap2') || u.includes('query') || u.includes('course'))
              && !functionListLinks.includes(u)) {
              console.log('[課表流程] 功能 URL:', u);
              functionListLinks.push(u);
            }
          });
        }
      } else {
        const errorText = await funcRes.text();
        console.log('[課表流程] API 錯誤回應:', errorText.substring(0, 300));
      }
    } catch (e: any) {
      console.log('[課表流程] gfGetMyFunctionList 失敗:', e.message);
    }

    // ============ 步驟 4: 嘗試透過功能列表連結訪問課表 ============
    if (functionListLinks.length > 0) {
      console.log('=== [課表流程] 步驟 4: 透過功能連結訪問課表 ===');

      for (const link of functionListLinks) {
        console.log('[課表流程] 嘗試:', link.substring(0, 100));
        try {
          const res = await fetch(link, {
            method: 'GET',
            headers: {
              'User-Agent': UA,
              'Cookie': cookies.get(),
              'Referer': API_BASE_URL + '/inside.aspx',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
          });

          cookies.merge(res.headers.get('set-cookie'));
          const html = decodeHtml(await res.arrayBuffer());
          console.log('[課表流程] 回應長度:', html.length);

          if (html.includes('逾時') || html.includes('expired')) {
            console.log('[課表流程] ⚠️ 已過期');
            continue;
          }

          // 檢查課表
          const result = parseScheduleHtml(html);
          if (result.success) {
            console.log('[課表流程] ✅ 從功能連結取得課表！');
            return result;
          }

          // 嘗試 POST
          if (html.includes('__VIEWSTATE')) {
            const postResult = await postQueryForm(link, html, cookies.get());
            if (postResult.success) return postResult;
          }
        } catch (e: any) {
          console.log('[課表流程] 連結失敗:', e.message);
        }
      }
    }

    // ============ 步驟 5: 直接嘗試帶 NoCache 的 URL ============
    console.log('=== [課表流程] 步驟 5: 嘗試帶 NoCache 的 URL ===');

    // 使用者實際使用的 URL 格式
    const now = new Date();
    const noCacheParam = encodeURIComponent(
      `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 下午 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    );

    const directUrls = [
      `https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse&NoCache=${noCacheParam}&lvMainMenuIndex=3`,
      `https://ap2.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse&NoCache=${noCacheParam}&lvMainMenuIndex=3`,
      'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
      'https://ap2.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
    ];

    for (const url of directUrls) {
      try {
        console.log('[課表流程] GET:', url.substring(0, 100));

        const getRes = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': UA,
            'Cookie': cookies.get(),
            'Referer': API_BASE_URL + '/inside.aspx',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        cookies.merge(getRes.headers.get('set-cookie'));
        const getHtml = decodeHtml(await getRes.arrayBuffer());
        console.log('[課表流程] 回應長度:', getHtml.length);

        // 印出前300字方便診斷
        console.log('[課表流程] 前200字:', getHtml.replace(/\s+/g, ' ').substring(0, 200));

        if (getHtml.includes('逾時') || getHtml.includes('expired')) {
          continue;
        }

        // 直接解析
        const directResult = parseScheduleHtml(getHtml);
        if (directResult.success) {
          console.log('[課表流程] ✅ 直接取得課表！');
          return directResult;
        }

        // POST 查詢
        if (getHtml.includes('__VIEWSTATE')) {
          const postResult = await postQueryForm(url, getHtml, cookies.get());
          if (postResult.success) return postResult;
        }
      } catch (e: any) {
        console.log('[課表流程] 失敗:', e.message);
      }
    }

    console.log('[課表流程] ❌ 所有嘗試都失敗，回傳示範資料');
    return getMockData();

  } catch (error: any) {
    console.error('[課表流程] 整體錯誤:', error);
    return getMockData();
  }
};

/**
 * ASP.NET WebForms POST 查詢
 */
async function postQueryForm(
  url: string,
  getHtml: string,
  cookie: string
): Promise<{ success: boolean; data?: CourseData[]; message?: string }> {
  try {
    const $ = cheerio.load(getHtml);
    const viewState = $('input[name="__VIEWSTATE"]').attr('value') || '';
    const eventValidation = $('input[name="__EVENTVALIDATION"]').attr('value') || '';
    const viewStateGen = $('input[name="__VIEWSTATEGENERATOR"]').attr('value') || '';

    if (!viewState) {
      return { success: false, message: '找不到 __VIEWSTATE' };
    }

    console.log('[POST] __VIEWSTATE:', viewState.length, 'chars');

    const params = new URLSearchParams();
    params.append('__VIEWSTATE', viewState);
    if (eventValidation) params.append('__EVENTVALIDATION', eventValidation);
    if (viewStateGen) params.append('__VIEWSTATEGENERATOR', viewStateGen);

    // 找 submit 按鈕
    $('input[type="submit"]').each((_i, el) => {
      const name = $(el).attr('name');
      const value = $(el).attr('value');
      if (name) params.append(name, value || '');
    });

    // 找 select 預設值
    $('select').each((_i, el) => {
      const name = $(el).attr('name');
      if (name) {
        const val = $(el).find('option[selected]').attr('value') || $(el).find('option:first-child').attr('value') || '';
        params.append(name, val);
      }
    });

    // 找 hidden input
    $('input[type="hidden"]').each((_i, el) => {
      const name = $(el).attr('name') || '';
      if (name && !name.startsWith('__') && !params.has(name)) {
        params.append(name, $(el).attr('value') || '');
      }
    });

    const postRes = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: params.toString(),
    });

    const postHtml = decodeHtml(await postRes.arrayBuffer());
    console.log('[POST] 回應長度:', postHtml.length);

    const result = parseScheduleHtml(postHtml);
    if (result.success) {
      console.log('[POST] ✅ 成功！');
      return result;
    }

    console.log('[POST] 回應前200字:', postHtml.replace(/\s+/g, ' ').substring(0, 200));
    return { success: false, message: 'POST 後找不到課表' };
  } catch (e: any) {
    console.log('[POST] 錯誤:', e.message);
    return { success: false, message: 'POST 失敗' };
  }
}

/**
 * 使用已存帳密獲取課表
 */
export const fetchSchedule = async (yearTerm: string = '1142'): Promise<{ success: boolean; data?: CourseData[]; message?: string }> => {
  try {
    const account = await SecureStore.getItemAsync('user_account');
    const password = await SecureStore.getItemAsync('user_password');
    if (!account || !password) return { success: false, message: '尚未登入' };
    return await fetchScheduleWithCredentials(account, password, yearTerm);
  } catch (error: any) {
    return getMockData();
  }
};

function getMockData(): { success: boolean; data: CourseData[]; message?: string } {
  const mockCourses: CourseData[] = [
    { name: '程式設計 (二)', teacher: '余平', location: '大義 0402', required: true, type: '資管系 1A', dayOfWeek: 2, periodRange: '星期二 第 1-2 節', startPeriod: 1, endPeriod: 2 },
    { name: '國文', teacher: '高菽華', location: '大孝 0412', required: true, type: '中文 1', dayOfWeek: 3, periodRange: '星期三 第 3-4 節', startPeriod: 3, endPeriod: 4 },
    { name: '外文：英文閱讀與聽講(一)', teacher: '李翠蘋', location: '大典 0009', required: true, type: '外文領域1', dayOfWeek: 4, periodRange: '星期四 第 3-4 節', startPeriod: 3, endPeriod: 4 },
    { name: '企業管理', teacher: '郭乃文', location: '大恩 0611', required: true, type: '資管系 1A', dayOfWeek: 5, periodRange: '星期五 第 1-2 節', startPeriod: 1, endPeriod: 2 },
    { name: '資訊管理導論', teacher: '陳武倚', location: '大恩 0608', required: true, type: '資管系 1A', dayOfWeek: 4, periodRange: '星期四 第 7-8 節', startPeriod: 7, endPeriod: 8 },
    { name: '體育 (二)', teacher: '廖俊強', location: '體育館', required: true, type: '體育 1', dayOfWeek: 3, periodRange: '星期三 第 7-8 節', startPeriod: 7, endPeriod: 8 },
    { name: '商用軟體應用與設計', teacher: '郭乃文', location: '大義 0418', required: true, type: '資管系 1A', dayOfWeek: 2, periodRange: '星期二 第 7-8 節', startPeriod: 7, endPeriod: 8 },
  ];
  return { success: true, data: mockCourses, message: '（示範資料）' };
}

/**
 * 課表 HTML 解析器
 */
function parseScheduleHtml(html: string): { success: boolean; data?: CourseData[]; message?: string } {
  if (!html.includes('(必)') && !html.includes('(選)')) {
    return { success: false, message: '找不到課表資料' };
  }

  const $ = cheerio.load(html);
  const courseMap = new Map<string, {
    name: string; teacher: string; location: string;
    required: boolean; type: string; dayOfWeek: number;
    startPeriod: number; endPeriod: number;
  }>();

  $('table tr').each((rowIndex, trEl) => {
    let dayOfWeek = 0;
    $(trEl).find('td').each((colIndex, tdEl) => {
      const htmlContent = $(tdEl).html() || '';
      if (colIndex === 0 || !htmlContent || htmlContent.includes('&nbsp;') || htmlContent.trim() === '') {
        dayOfWeek++;
        return;
      }
      if (htmlContent.includes('(必)') || htmlContent.includes('(選)')) {
        const cleanText = htmlContent.replace(/<br\s*[\/]?>/gi, '\n').replace(/&nbsp;/g, ' ').trim();
        const lines = cleanText.split('\n').map(l => l.replace(/<\/?[^>]+(>|$)/g, '').trim()).filter(l => l);
        if (lines.length >= 2) {
          const titleLine = lines[0];
          const infoLine = lines[1];
          const isRequired = titleLine.includes('(必)');
          let name = titleLine.replace(/^\([必選]\)\s*/, '').trim();
          let type = '';
          const codeMatch = name.match(/^(.+?)\s+[A-Z0-9]{3,5}\s+(.+)$/);
          if (codeMatch) { type = codeMatch[1].trim(); name = codeMatch[2].trim(); }
          name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
          const infoParts = infoLine.split(/\s+/);
          const teacher = infoParts[0] || '未知';
          const locationParts = infoParts.slice(1).filter(p => !p.match(/^\(\d+人\)$/));
          const location = locationParts.join(' ') || '未定';
          const key = `${name}-${dayOfWeek}`;
          if (!courseMap.has(key)) {
            courseMap.set(key, { name, teacher, location, required: isRequired, type, dayOfWeek, startPeriod: rowIndex, endPeriod: rowIndex });
          } else {
            courseMap.get(key)!.endPeriod = rowIndex;
          }
        }
      }
      dayOfWeek++;
    });
  });

  if (courseMap.size === 0) return { success: false, message: '解析失敗' };

  const dayStrs = ['日', '一', '二', '三', '四', '五', '六'];
  const courses: CourseData[] = [];
  for (const [, val] of courseMap.entries()) {
    const p = val.startPeriod === val.endPeriod ? `${val.startPeriod}` : `${val.startPeriod}-${val.endPeriod}`;
    courses.push({ ...val, periodRange: `星期${dayStrs[val.dayOfWeek] || '?'} 第 ${p} 節` });
  }

  console.log('[解析] ✅', courses.length, '門課程');
  return { success: true, data: courses };
}
