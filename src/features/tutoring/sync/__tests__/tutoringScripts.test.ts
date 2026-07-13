import {
  buildTutoringFileDownloadScript,
  buildTutoringFileUploadScript,
  buildTutoringSingleCourseScript,
  buildWaitForCourseFpScript,
} from '../tutoringScripts';
import { baseHelpers } from '../scriptBuilder';

function runHelperExpression<T>(expression: string, value: unknown): T {
  return new Function('value', `${baseHelpers}; return (${expression});`)(value) as T;
}

describe('buildWaitForCourseFpScript', () => {
  it('adopts CourseFP from global AjaxMethods or accessible frames before running callback', () => {
    const script = buildWaitForCourseFpScript('post({ t: "ok" });');

    expect(script).toContain('function findCourseFpContext()');
    expect(script).toContain('window.AjaxMethods');
    expect(script).toContain('iframe, frame');
    expect(script).toContain('window.CourseFP = { AjaxMethods: context.ajaxMethods };');
    expect(script).toContain('post({ t: "ok" });');
  });
});

describe('buildTutoringSingleCourseScript', () => {
  it('fetches course detail, assignment attachments, progress, and classmates', () => {
    const script = buildTutoringSingleCourseScript('CS101');

    expect(script).toContain('GetAnnoData(courseCode, 1, 30)');
    expect(script).toContain("GetTeacherInfo(courseCode, 'mainpage')");
    expect(script).toContain('LoadCInfo(courseCode)');
    expect(script).toContain('courseInfo: courseInfo');
    expect(script).toContain('GetAnnoDetail(courseCode, row.SN)');
    expect(script).toContain('GetMaterialData(courseCode)');
    expect(script).toContain('GetHomeworkList()');
    expect(script).toContain('GetWorkAttList');
    expect(script).toContain('GetLearningProgress');
    expect(script).toContain('progress.length === 0');
    expect(script).toContain('progressSource');
    expect(script).toContain('progressMethodCandidates');
    expect(script).toContain('readMarkedProgressRowsFromDocuments(courseCode)');
    expect(script).toContain('readCourseScheduleProgressRowsFromDocuments(courseCode)');
    expect(script).toContain('fetchCourseFullContentProgressRows(courseCode)');
    expect(script).toContain("progressSource = progress.length > 0 ? 'fullcontent_html' : 'none'");
    expect(script).toContain("'fullcontent.aspx?course=' + encodeURIComponent(targetCourseCode)");
    expect(script).toContain('fullcontent_progress');
    expect(script).toContain('clickCourseEntry(courseNavigationHints)');
    expect(script).toContain('clickCourseProgressTab()');
    expect(script).toContain('/^(?:進度|progress)(?:\\s*\\d+)?$/i.test(text)');
    expect(script).toContain(
      'var selectors = \'a, button, input, td, [role="tab"], [onclick], li, span\';',
    );
    expect(script).not.toContain('progressHashCandidates');
    expect(script).not.toContain('tryProgressHashCandidates');
    expect(script).toContain('readProgressAfterNavigation');
    expect(script).toContain('waitForProgressRows');
    expect(script).toContain('remainingAttempts');
    expect(script).toContain('compactWeekDateMatch');
    expect(script).toContain('startIndex');
    expect(script).toContain('weekPrefixMatch');
    expect(script).not.toContain('prefix.match(/(d{1,2})s*$/)');
    expect(script).toContain(
      "source.replace(/(^|\\s)(\\d{1,2})(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/g, '$1$2 $3')",
    );
    expect(script).toContain('Detail');
    expect(script).toContain('progress_probe');
    expect(script).toContain("progressSource = progress.length > 0 ? 'schedule_html'");
    expect(script).not.toContain("doc.querySelectorAll('td, th, div, span, li, p, label')");
    expect(script).not.toContain('parseTextProgress(textOf(nodes[j]))');
    expect(script).toContain('GetClassmateList');
    expect(script).toContain('progress: progress');
    expect(script).toContain('classmates: normalizeClassmateRows');
  });

  it('generates syntactically valid injected JavaScript', () => {
    const script = buildWaitForCourseFpScript(buildTutoringSingleCourseScript('CS101'));

    expect(() => new Function(script)).not.toThrow();
  });
});

describe('tutoring injected text normalization', () => {
  it('decodes HTML entities in classmate names before posting detail data', () => {
    const classmate = runHelperExpression<{ name: string }>('normalizeClassmateRow(value, 0)', {
      ID: 'A001',
      Name: '&#x9673;&#x5927;&#x6587;',
    });

    expect(classmate.name).toBe('陳大文');
  });

  it('uses the clearest available classmate name when one source is mojibake', () => {
    const classmate = runHelperExpression<{ name: string }>('normalizeClassmateRow(value, 0)', {
      ID: 'A002',
      Name: '\u00e7\u008e\u008b\u00e5\u00b0\u008f\u00e6\u0098\u008e',
      StdName: '王小明',
    });

    expect(classmate.name).toBe('王小明');
  });

  it('decodes progress titles and values before posting detail data', () => {
    const progress = runHelperExpression<{ title: string; value: string }>(
      'normalizeProgressRow(value, 0)',
      { Title: '&#x8AB2;&#x7A0B;&#x9032;&#x5EA6;', Value: '&#49;&#48;&#48;&#37;' },
    );

    expect(progress.title).toBe('課程進度');
    expect(progress.value).toBe('100%');
  });

  it('uses the clearest available progress title when one source is mojibake', () => {
    const progress = runHelperExpression<{ title: string }>('normalizeProgressRow(value, 0)', {
      Title: '\u00e8\u00aa\u00b2\u00e7\u00a8\u008b\u00e9\u0080\u00b2\u00e5\u00ba\u00a6',
      Label: '課程進度',
    });

    expect(progress.title).toBe('課程進度');
  });
});

describe('tutoring progress HTML extraction', () => {
  it('extracts week, date, title, and reading notes from a single course progress page', () => {
    const rows = runHelperExpression<{ Title: string; Value: string }[]>(
      'parseCourseScheduleProgressText(value)',
      [
        '4026 企業管理',
        '1 2026/02/24 課程說明',
        '2 2026/03/03 管理學概論(1) Reading: chapter 01',
        '3 2026/03/10 管理學概論(2)',
      ].join('\n'),
    );

    expect(rows).toEqual([
      {
        ID: 'course-schedule-progress-0',
        Title: '第 1 週 課程說明',
        Value: '2026/02/24',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-1',
        Title: '第 2 週 管理學概論(1)',
        Value: '2026/03/03 · Reading: chapter 01',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-2',
        Title: '第 3 週 管理學概論(2)',
        Value: '2026/03/10',
        Percent: null,
      },
    ]);
  });

  it('extracts progress rows from the public fullcontent syllabus format', () => {
    const rows = runHelperExpression<{ Title: string; Value: string }[]>(
      'parseCourseScheduleProgressText(value)',
      [
        '課程進度',
        '  1. 2026/02/24  | 課程說明',
        '  2. 2026/03/03  | 管理學概論(1)',
        'Reading: chapter 01',
        '  3. 2026/03/10  | 管理學概論(2)',
      ].join('\n'),
    );

    expect(rows).toEqual([
      {
        ID: 'course-schedule-progress-0',
        Title: '第 1 週 課程說明',
        Value: '2026/02/24',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-1',
        Title: '第 2 週 管理學概論(1)',
        Value: '2026/03/03 · Reading: chapter 01',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-2',
        Title: '第 3 週 管理學概論(2)',
        Value: '2026/03/10',
        Percent: null,
      },
    ]);
  });

  it('extracts date-only progress rows from the current public fullcontent format', () => {
    const rows = runHelperExpression<{ Title: string; Value: string }[]>(
      'parseCourseScheduleProgressText(value)',
      [
        '課程進度',
        '2026/02/24 課程說明',
        '2026/03/03 管理學概論(1) 指定研讀資料 chapter 01',
        '2026/03/10 管理學概論(2)',
        '2026/05/05 人力資源管理',
      ].join('\n'),
    );

    expect(rows).toEqual([
      {
        ID: 'course-schedule-progress-0',
        Title: '第 1 週 課程說明',
        Value: '2026/02/24',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-1',
        Title: '第 2 週 管理學概論(1)',
        Value: '2026/03/03 · Reading: chapter 01',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-2',
        Title: '第 3 週 管理學概論(2)',
        Value: '2026/03/10',
        Percent: null,
      },
      {
        ID: 'course-schedule-progress-3',
        Title: '第 4 週 人力資源管理',
        Value: '2026/05/05',
        Percent: null,
      },
    ]);
  });

  it('does not treat an unrelated course list as the selected course progress document', () => {
    const isProgressDocument = runHelperExpression<boolean>(
      "isCourseProgressDocument(value, '4026')",
      {
        url: 'https://icas.pccu.edu.tw/cfp/',
        title: '我的課程',
        activeText: '我的課程',
        headerText: '我的課程',
        bodyText: ['4026 企業管理', '2026/05/05 體育', '2026/04/13 商用軟體應用與設計'].join('\n'),
      },
    );

    expect(isProgressDocument).toBe(false);
  });

  it('accepts the selected course progress document', () => {
    const isProgressDocument = runHelperExpression<boolean>(
      "isCourseProgressDocument(value, '4026')",
      {
        url: 'https://icas.pccu.edu.tw/cfp/CourseProgress',
        title: '4026 企業管理',
        activeText: '進度',
        headerText: '4026 企業管理',
        bodyText: '1 2026/02/24 課程說明',
      },
    );

    expect(isProgressDocument).toBe(true);
  });

  it('accepts progress pages when the course header is only present in body text', () => {
    const isProgressDocument = runHelperExpression<boolean>(
      "isCourseProgressDocument(value, '4026')",
      {
        url: 'https://icas.pccu.edu.tw/cfp/',
        title: '',
        activeText: '進度',
        headerText: '',
        bodyText: ['4026 企業管理', '1 2026/02/24 課程說明', '2 2026/03/03 管理學概論(1)'].join(
          '\n',
        ),
      },
    );

    expect(isProgressDocument).toBe(true);
  });

  it('rejects course pages with dates when the progress tab is not active', () => {
    const isProgressDocument = runHelperExpression<boolean>(
      "isCourseProgressDocument(value, '4026')",
      {
        url: 'https://icas.pccu.edu.tw/cfp/',
        title: '',
        activeText: '我的課程',
        headerText: '',
        bodyText: ['4026 企業管理', '1 2026/02/24 課程說明'].join('\n'),
      },
    );

    expect(isProgressDocument).toBe(false);
  });
});

describe('tutoring file operation scripts', () => {
  it('generates a download script that posts base64 file payloads', () => {
    const script = buildTutoringFileDownloadScript({
      courseCode: 'CS101',
      kind: 'material',
      targetNo: 123,
      fileName: 'week1.pdf',
    });

    expect(script).toContain('file_downloaded');
    expect(script).toContain('blobToBase64');
    expect(script).toContain("credentials: 'include'");
    expect(() => new Function(script)).not.toThrow();
  });

  it('generates an upload script that sends one FormData file', () => {
    const script = buildTutoringFileUploadScript({
      courseCode: 'CS101',
      homeSn: 456,
      fileName: 'homework.pdf',
      mimeType: 'application/pdf',
      base64: 'Zm9v',
    });

    expect(script).toContain('file_uploaded');
    expect(script).toContain("form.append('sn'");
    expect(script).toContain("form.append('homeworkFile'");
    expect(script).toContain('/cfp/Files/Upload.ashx?mode=homework');
    expect(script).not.toContain('files[]');
    expect(() => new Function(script)).not.toThrow();
  });
});
