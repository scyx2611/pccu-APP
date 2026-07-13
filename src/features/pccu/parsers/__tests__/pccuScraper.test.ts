import fs from 'fs';
import path from 'path';
import { parseGradesFromHtml, parseScheduleFromHtml } from '../pccuScraper';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../../__fixtures__/html', name), 'utf8');

describe('pccuScraper parser', () => {
  it('valid schedule HTML -> non-empty parsed courses', () => {
    const html = fixture('schedule-valid.html');
    const courses = parseScheduleFromHtml(html);

    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0].name).toBeTruthy();
    expect(courses[0].startPeriod).toBeGreaterThan(0);
  });

  it('valid grade HTML -> non-empty parsed semesters/courses', () => {
    const html = fixture('grade-valid.html');
    const semesters = parseGradesFromHtml(html);

    expect(semesters.length).toBeGreaterThan(0);
    expect(semesters[0].courses.length).toBeGreaterThan(0);
  });

  it('parses grades from multi-row header tables grouped by semester', () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td colspan="6">113學年度第1學期</td></tr>
            <tr>
              <th rowspan="2">選課別</th>
              <th rowspan="2">科目代號</th>
              <th rowspan="2">科目名稱</th>
              <th colspan="2">成績資料</th>
              <th rowspan="2">備註</th>
            </tr>
            <tr>
              <th>學分</th>
              <th>學期成績</th>
            </tr>
            <tr>
              <td>必修</td>
              <td>CS1010</td>
              <td>程式設計</td>
              <td>3</td>
              <td>85</td>
              <td></td>
            </tr>
            <tr><td colspan="6">113學年度第2學期</td></tr>
            <tr>
              <th>選課別</th>
              <th>科目代號</th>
              <th>科目名稱</th>
              <th>學分</th>
              <th>學期成績</th>
              <th>備註</th>
            </tr>
            <tr>
              <td>選修</td>
              <td>EN2020</td>
              <td>英文會話</td>
              <td>2</td>
              <td>通過</td>
              <td></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const semesters = parseGradesFromHtml(html);

    expect(semesters).toHaveLength(2);
    expect(semesters[0].title).toBe('113學年度第1學期');
    expect(semesters[0].courses).toEqual([
      expect.objectContaining({ code: 'CS1010', name: '程式設計', credits: '3', score: '85' }),
    ]);
    expect(semesters[1].title).toBe('113學年度第2學期');
    expect(semesters[1].courses).toEqual([
      expect.objectContaining({ code: 'EN2020', name: '英文會話', credits: '2', score: '通過' }),
    ]);
  });

  it('parses historical grade tables that omit course codes', () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td colspan="5">113學年度第1學期</td></tr>
            <tr>
              <th>選課別</th>
              <th>科目名稱</th>
              <th>學分</th>
              <th>學期成績</th>
              <th>備註</th>
            </tr>
            <tr>
              <td>必修</td>
              <td>程式設計</td>
              <td>3</td>
              <td>88</td>
              <td></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const semesters = parseGradesFromHtml(html);

    expect(semesters).toHaveLength(1);
    expect(semesters[0].courses).toEqual([
      expect.objectContaining({
        type: '必修',
        code: '',
        name: '程式設計',
        credits: '3',
        score: '88',
      }),
    ]);
  });

  it('parses historical grade tables with split subject headers and no course codes', () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td colspan="5">113\u5b78\u5e74\u5ea6\u7b2c1\u5b78\u671f</td></tr>
            <tr>
              <th rowspan="2">\u9078\u8ab2\u5225</th>
              <th colspan="1">\u79d1\u76ee</th>
              <th rowspan="2">\u5b78\u5206</th>
              <th rowspan="2">\u5b78\u671f\u6210\u7e3e</th>
              <th rowspan="2">\u5099\u8a3b</th>
            </tr>
            <tr>
              <th>\u540d\u7a31</th>
            </tr>
            <tr>
              <td>\u5fc5\u4fee</td>
              <td>\u7a0b\u5f0f\u8a2d\u8a08</td>
              <td>3</td>
              <td>91</td>
              <td></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const semesters = parseGradesFromHtml(html);

    expect(semesters).toHaveLength(1);
    expect(semesters[0].title).toBe('113\u5b78\u5e74\u5ea6\u7b2c1\u5b78\u671f');
    expect(semesters[0].courses).toEqual([
      expect.objectContaining({
        type: '\u5fc5\u4fee',
        code: '',
        name: '\u7a0b\u5f0f\u8a2d\u8a08',
        credits: '3',
        score: '91',
      }),
    ]);
  });

  it('merges consecutive schedule periods and keeps teacher/location', () => {
    const html = `
      <html>
        <body>
          <table>
            <tr>
              <th>節次</th>
              <th>時間</th>
              <th>星期一</th>
              <th>星期二</th>
            </tr>
            <tr>
              <td>1</td>
              <td>08:10</td>
              <td class="pubContent">(必)<br />共同必修 CS9999 程式設計<br />王小明 B101</td>
              <td class="pubContent"></td>
            </tr>
            <tr>
              <td>2</td>
              <td>09:10</td>
              <td class="pubContent">(必)<br />共同必修 CS9999 程式設計<br />王小明 B101</td>
              <td class="pubContent"></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const courses = parseScheduleFromHtml(html);

    expect(courses).toHaveLength(1);
    expect(courses[0]).toEqual(
      expect.objectContaining({
        name: '程式設計',
        teacher: '王小明',
        location: 'B101',
        required: true,
        type: '共同必修',
        dayOfWeek: 1,
        startPeriod: 1,
        endPeriod: 2,
      }),
    );
  });

  it('empty HTML -> empty arrays', () => {
    expect(parseScheduleFromHtml('')).toEqual([]);
    expect(parseGradesFromHtml('')).toEqual([]);
  });

  it('malformed HTML -> graceful fallback', () => {
    const malformed = fixture('malformed.html');

    expect(() => parseScheduleFromHtml(malformed)).not.toThrow();
    expect(() => parseGradesFromHtml(malformed)).not.toThrow();
  });

  it('error page HTML -> safe empty result', () => {
    const html = fixture('error-page.html');

    expect(parseScheduleFromHtml(html)).toEqual([]);
    expect(parseGradesFromHtml(html)).toEqual([]);
  });
});
