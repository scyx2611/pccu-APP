const fs = require('fs');
const path = require('path');

// 引入 TypeScript 編譯後的 scraper 函數 (我們直接複製邏輯過來測)
const cheerio = require('cheerio');

function parseGradesFromHtml(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const semesters = [];
  let currentSemester = null;
  const norm = (s) => s.replace(/\s|　/g, '');

  const allText = $('table').text().replace(/\s+/g, ' ');
  const globalStats = {
    average: allText.match(/總平均[：:]\s*([0-9.]+)/)?.[1],
    classRank: allText.match(/班排名[：:]\s*([0-9]+\s*\/\s*[0-9]+)/)?.[1],
    deptRank: allText.match(/系排名[：:]\s*([0-9]+\s*\/\s*[0-9]+)/)?.[1],
  };

  $('tr').each((i, el) => {
    const cells = $(el).children('td, th').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
    const allCells = cells.length > 0 ? cells : $(el).find('td, th').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
    if (allCells.length === 0) return;

    const rowText = allCells.join(' ');
    console.log(`[Row ${i}] length=${allCells.length} ->`, rowText.substring(0, 60));

    if (rowText.includes('學年度') && rowText.includes('年級')) {
      let title = rowText.split('(')[0].trim();
      const m = title.match(/(\d{3}\s*學年度.*?年級.*?班)/);
      if (m) title = m[1].trim();

      if (semesters.find(s => s.title === title)) {
        currentSemester = null;
        return;
      }
      currentSemester = { title, courses: [], stats: {} };
      semesters.push(currentSemester);
      return;
    }

    if (currentSemester && allCells.length >= 5) {
      const type = allCells[0].trim();
      const code = allCells[1]?.trim() || '';
      
      if (['必', '選', '通'].includes(type)) {
        console.log(`   -> Found Course: Type=${type}, Code=${code}, Name=${allCells[2]}, Credits=${allCells[3]}, Score=${allCells[4]}`);
        
        if (code !== '0000') {
           const name = (allCells[2] || '').replace(/　/g, '').trim();
           const sem1Credits = allCells[3]?.trim() || '0';
           const sem1Score = allCells[4]?.trim() || '';
           
           let finalCredits = sem1Credits;
           let finalScore = sem1Score;

           if (!sem1Score && allCells.length >= 7) {
               const sem2Credits = allCells[5]?.trim() || '0';
               const sem2Score = allCells[6]?.trim() || '';
               if (sem2Score) {
                   finalCredits = sem2Credits;
                   finalScore = sem2Score;
               }
           }
           
           if (name) {
             currentSemester.courses.push({
               type, code, name, credits: finalCredits, score: finalScore || '0'
             });
           }
        }
      }
    }
  });

  if (semesters.length > 0) {
    const main = semesters.find(s => s.title !== '入學前抵免') || semesters[0];
    if (globalStats.average) main.stats.average = globalStats.average;
    if (globalStats.classRank) main.stats.classRank = globalStats.classRank;
    if (globalStats.deptRank) main.stats.deptRank = globalStats.deptRank;
  }

  return semesters;
}

// 讀取剛剛成功抓取的 table html
// const tableHtml = fs.readFileSync(path.join(__dirname, 'grades_result.txt'), 'utf-8');

// 因為 grades_result.txt 存的是 body.innerText 或 純文字，不是 HTML！
// 讓我們用之前分析到的 HTML 結構來測試
const mockHtml = `
<table>
  <tr>
    <td><img id="Img114 " src="/queryStdSele/img/open.gif"> 114 學年度 資管系 1年級 A班 ( 114 年9月115年7月止)</td>
  </tr>
</table>
<table width="600" border="1" class="pubTable">
  <tr class="pubTdItem">
    <td rowspan="2">選課別</td><td rowspan="2">科目代號</td><td rowspan="2">科目名稱</td><td colspan="2">第一學期</td><td colspan="2">第二學期</td>
  </tr>
  <tr class="pubTdItem">
    <td>學分</td><td>成績</td><td>學分</td><td>成績</td>
  </tr>
  <tr>
    <td>  </td><td>0000</td><td>操行成績</td><td>0</td><td>83</td><td></td><td></td>
  </tr>
  <tr>
    <td>必</td><td>CA14</td><td>國文</td><td>2</td><td>62</td><td></td><td></td>
  </tr>
  <tr>
    <td>必</td><td>CB47</td><td>外文︰英文閱讀與聽講(一)</td><td>1.5</td><td>60</td><td></td><td></td>
  </tr>
  <tr>
    <td>通</td><td>CEG7</td><td>自然通識</td><td>2</td><td>97</td><td></td><td></td>
  </tr>
</table>
<table>
  <tr><td>在學生：成績計算至1141</td><td>總平均：70.55</td></tr>
  <tr><td> </td><td>班排名：15 / 47</td><td>百分比：31.91</td></tr>
  <tr><td> </td><td>系排名：40 / 88</td><td>百分比：45.45</td></tr>
</table>
`;

const res = parseGradesFromHtml(mockHtml);
console.log(JSON.stringify(res, null, 2));
