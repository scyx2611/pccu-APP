import * as cheerio from 'cheerio';

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

export interface CourseGrade {
  type: string;
  code: string;
  name: string;
  credits: string;
  score: string;
}

export interface SemesterGrade {
  title: string;
  courses: CourseGrade[];
  stats: {
    totalPoints?: string;
    average?: string;
    earnedCredits?: string;
    classRank?: string;
    deptRank?: string;
  };
}

export function parseGradesFromHtml(html: string): SemesterGrade[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const semesters: SemesterGrade[] = [];
  let currentSemester: SemesterGrade | null = null;
  const norm = (s: string) => s.replace(/\s|　/g, '');

  // 1. 抓取全校總排名 (通常在單獨表格中)
  const allText = $('table').text().replace(/\s+/g, ' ');
  const globalStats = {
    average: allText.match(/總平均[：:]\s*([0-9.]+)/)?.[1],
    classRank: allText.match(/班排名[：:]\s*([0-9]+\s*\/\s*[0-9]+)/)?.[1],
    deptRank: allText.match(/系排名[：:]\s*([0-9]+\s*\/\s*[0-9]+)/)?.[1],
  };

  // 2. 逐行解析所有表格
  $('tr').each((i, el) => {
    // 獲取該列的所有 td/th
    const cells = $(el).children('td, th').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
    
    // 如果直接子層沒抓到，試試抓全部 (應付巢狀異常)
    const allCells = cells.length > 0 ? cells : $(el).find('td, th').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
    if (allCells.length === 0) return;

    const rowText = allCells.join(' ');
    const rowNorm = norm(rowText);

    // 偵測學期標題
    if (rowText.includes('學年度') && rowText.includes('年級')) {
      let title = rowText.split('(')[0].trim();
      const m = title.match(/(\d{3}\s*學年度.*?年級.*?班)/);
      if (m) title = m[1].trim();

      // 改進去重：如果已經有這個學期，直接切換 currentSemester 指標，而不是 null (這樣後面的課程才能被加進去！)
      const existing = semesters.find(s => s.title === title);
      if (existing) {
        currentSemester = existing;
        return;
      }
      
      currentSemester = { title, courses: [], stats: {} };
      semesters.push(currentSemester);
      return;
    }

    if (rowNorm.includes('入學前抵免')) {
      const existing = semesters.find(s => s.title === '入學前抵免');
      if (existing) {
        currentSemester = existing;
        return;
      }
      currentSemester = { title: '入學前抵免', courses: [], stats: {} };
      semesters.push(currentSemester);
      return;
    }

    // 寬鬆課程解析：只要有科目代號，就嘗試抓取
    if (currentSemester && allCells.length >= 4) {
      let type = '';
      let code = '';
      let name = '';
      let credits = '';
      let score = '';

      // 尋找符合科目代號的欄位 (通常是英文+數字或純數字，如 CA14, 4001)
      const codeIndex = allCells.findIndex(cell => /^[A-Z0-9]{4,}$/.test(cell));
      
      if (codeIndex !== -1 && allCells[codeIndex] !== '0000') {
         code = allCells[codeIndex];
         
         // 往前找選課別
         if (codeIndex > 0) {
            const possibleType = allCells[codeIndex - 1].replace(/　/g, '').trim();
            if (['必', '選', '通'].includes(possibleType)) {
               type = possibleType;
            }
         }
         
         // 往後找科目名稱
         name = (allCells[codeIndex + 1] || '').replace(/　/g, '').trim();
         
         // 再往後找學分與成績
         // 由於歷年成績單可能有兩學期 (學分1 成績1 學分2 成績2)
         const restCells = allCells.slice(codeIndex + 2).filter(c => c.trim() !== '');
         
         if (restCells.length >= 2) {
             credits = restCells[0];
             score = restCells[1];
             
             // 如果第一學期沒分數，往後找第二學期
             if ((!score || score === '0') && restCells.length >= 4) {
                 credits = restCells[2];
                 score = restCells[3];
             }
         }

         // 防呆，如果沒找到 type，預設給個空字串，只要有 code 就可以算是一門課
         if (!type && ['必', '選', '通'].includes(allCells[0].replace(/　/g, '').trim())) {
             type = allCells[0].replace(/　/g, '').trim();
         }

         if (name && (score || score === '0' || score === '抵')) {
            // 檢查這門課是不是已經加過了
            const isDuplicate = currentSemester.courses.some(c => c.code === code);
            if (!isDuplicate) {
                currentSemester.courses.push({
                  type: type || '必',
                  code,
                  name,
                  credits: credits || '0',
                  score: score || ''
                });
            }
         }
      }
    }

    // 解析學期平均 (備用)
    if (currentSemester && rowText.includes('學業成績平均')) {
        const val = allCells[allCells.length - 1];
        if (val && /[0-9.]/.test(val)) currentSemester.stats.average = val;
    }
  });

  // 3. 將抓到的全域排名放入第一個學期 (最新的)
  if (semesters.length > 0) {
    const main = semesters.find(s => s.title !== '入學前抵免') || semesters[0];
    if (globalStats.average) main.stats.average = globalStats.average;
    if (globalStats.classRank) main.stats.classRank = globalStats.classRank;
    if (globalStats.deptRank) main.stats.deptRank = globalStats.deptRank;
  }

  return semesters;
}

export function parseScheduleHtml(html: string): { success: boolean; data?: CourseData[]; message?: string } {
  if (!html.includes('(必)') && !html.includes('(選)')) return { success: false, message: '找不到資料' };
  const $ = cheerio.load(html);
  const courseMap = new Map<string, any>();
  $('table tr').each((rowIndex, trEl) => {
    let dayOfWeek = 0;
    $(trEl).find('td').each((colIndex, tdEl) => {
      const content = $(tdEl).html() || '';
      if (colIndex === 0 || !content || content.includes('&nbsp;')) { dayOfWeek++; return; }
      if (content.includes('(必)') || content.includes('(選)')) {
        const lines = content.replace(/<br\s*[\/]?>/gi, '\n').split('\n').map(l => l.replace(/<\/?[^>]+(>|$)/g, '').trim()).filter(Boolean);
        if (lines.length >= 2) {
          const name = lines[0].replace(/^\([必選]\)\s*/, '').trim();
          const key = `${name}-${dayOfWeek}`;
          if (!courseMap.has(key)) {
            courseMap.set(key, { name, teacher: lines[1].split(' ')[0], location: lines[1].split(' ')[1] || '', dayOfWeek, startPeriod: rowIndex, endPeriod: rowIndex });
          } else {
            courseMap.get(key).endPeriod = rowIndex;
          }
        }
      }
      dayOfWeek++;
    });
  });
  return { success: true, data: Array.from(courseMap.values()).map(c => ({ ...c, type: '必', required: true, periodRange: `星期${c.dayOfWeek} 第 ${c.startPeriod}-${c.endPeriod} 節` })) };
}
