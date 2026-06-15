import {
  buildAdaptiveSchedulePageScript,
  buildLoginScript,
  buildRobustGradePageScript,
  buildRobustSchedulePageScript,
  buildServiceOpenScript,
} from '../pccuSyncScripts';

describe('buildLoginScript', () => {
  it('does not treat inside.aspx URL alone as an authenticated session', () => {
    const script = buildLoginScript({ account: 'u123', password: 'p456' });

    expect(script).not.toContain("return { authenticated: true, signal: 'inside_page' };");
    expect(script).toContain('hasStrongAuthenticatedSignal');
  });

  it('does not force inside.aspx fallback from generic greeting text', () => {
    const script = buildLoginScript({ account: 'u123', password: 'p456' });

    expect(script).not.toContain('/同學|您好|welcome|登出|logout/i.test(bodyText)');
    expect(script).toContain('var loginInputsVisible = hasLoginInputsVisible();');
    expect(script).toContain('!loginInputsVisible && hasStrongAuthenticatedSignal');
  });

  it('prefers visible enabled credential fields and reports fill status without exposing secrets', () => {
    const script = buildLoginScript({ account: 'u123', password: 'p456' });

    expect(script).toContain('function findFirstUsableElement(selectors)');
    expect(script).toContain('function isUsableCredentialField(node)');
    expect(script).toContain('var accountFilled = isFieldFilled(accountInput)');
    expect(script).toContain('var passwordFilled = isFieldFilled(passwordInput)');
    expect(script).toContain("post({ t: 'status', m: '登入欄位填寫狀態 account=' + accountFilled + ' password=' + passwordFilled });");
    expect(script).not.toContain('password=p456');
  });
});

describe('buildAdaptiveSchedulePageScript', () => {
  it('uses queryByStudent form submit strategy without gfOpenLink dependency', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).toContain('queryByStudent.asp?QuerySource=queryCourse');
    expect(script).toContain('findQueryForm');
    expect(script).toContain('resolveFormAction');
    expect(script).toContain('submitQueryForm');
    expect(script).toContain("var searchFlag = form.querySelector('[name=\"hidChkSearch\"]');");
    expect(script).toContain("var searchAction = 'searchByStudent';");
    expect(script).toContain('searchFlag.value = searchAction;');
    expect(script).toContain('Schedule query requires relogin');
    expect(script).toContain('Schedule query timed out');
    expect(script).not.toContain('gfOpenLink');
  });

  it('always posts an initial schedule sync status and does not silently return on active state', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).toContain('開始同步課表頁面');
    expect(script).not.toContain('if (syncState.active) {\n          return;\n        }');
    expect(script).toContain('if (syncState.active) {');
    expect(script).toContain('syncState.active = false;');
  });

  it('uses fuzzy clickable ancestor matching for the student schedule entry', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).toContain('function scheduleEntryTextMatches(text)');
    expect(script).toContain('function closestClickableAncestor(node)');
    expect(script).toContain('function findStudentScheduleEntryByText()');
    expect(script).toContain('describeScheduleEntryCandidates');
  });

  it('defines schedule work-doc helpers before extractLoop uses them', () => {
    const script = buildAdaptiveSchedulePageScript();
    const getDocUrlIndex = script.indexOf('function getDocUrl(doc)');
    const resolveUrlIndex = script.indexOf('function resolveUrl(baseUrl, maybeRelative)');
    const classifyStateIndex = script.indexOf('function classifyScheduleState(doc, html)');
    const definitionIndex = script.indexOf('function findScheduleWorkDoc()');
    const usageIndex = script.indexOf('var workDocMatch = findScheduleWorkDoc();');

    expect(getDocUrlIndex).toBeGreaterThan(-1);
    expect(resolveUrlIndex).toBeGreaterThan(-1);
    expect(classifyStateIndex).toBeGreaterThan(-1);
    expect(definitionIndex).toBeGreaterThan(-1);
    expect(usageIndex).toBeGreaterThan(-1);
    expect(getDocUrlIndex).toBeLessThan(classifyStateIndex);
    expect(resolveUrlIndex).toBeLessThan(classifyStateIndex);
    expect(classifyStateIndex).toBeLessThan(definitionIndex);
    expect(definitionIndex).toBeLessThan(usageIndex);
  });

  it('does not treat generic pubContent pages like queryByCourse as schedule-ready', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).not.toContain('/pubTdItem_Period|pubContent/.test(markup)');
    expect(script).toContain('function hasScheduleResultMarker(html) {');
    expect(script).toContain('var markup = String(html || \'\');');
    expect(script).toContain('/pubTdItem_Period|PrintTitle/.test(markup)');
    expect(script).not.toContain('/pubContent/.test(markup)');
  });

  it('falls back to direct student schedule navigation from queryByCourse/index pages', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).toContain('function isScheduleMenuPage(url)');
    expect(script).toContain('function navigateToStudentSchedulePage(doc)');
    expect(script).toContain('queryByStudent.asp?QuerySource=queryCourse');
    expect(script).toContain("post({ t: 'status', m: '\\u76f4\\u63a5\\u5207\\u5230\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62...' });");
  });

  it('does not treat generic login text on AP1 pages as relogin', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).not.toContain('|relogin|login/i.test(text || \'\')');
    expect(script).toContain('login has expired|please login again|session expired');
  });
});

describe('buildRobustSchedulePageScript', () => {
  it('reuses the adaptive schedule query flow', () => {
    const script = buildRobustSchedulePageScript();

    expect(script).toContain('queryByStudent.asp?QuerySource=queryCourse');
    expect(script).toContain('findQueryForm');
    expect(script).toContain('submitQueryForm');
    expect(script).toContain('開始同步課表頁面');
    expect(script).not.toContain('gfOpenLink');
  });
});

describe('buildServiceOpenScript', () => {
  it('uses schedule-specific target detection for code 1208', () => {
    const script = buildServiceOpenScript('1208');

    expect(script).toContain('PrjNo=1208|queryByStudent');
    expect(script).not.toContain('PrjNo=1220|index_score|scoreListAll|StudentScore|studentscore');
  });

  it('keeps polling after gfOpenLink and includes the ap1 direct fallback for code 1208', () => {
    const script = buildServiceOpenScript('1208');

    expect(script).toContain('https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse');
    expect(script).toContain('post({ t: \'popup\', url: fallbackTargetUrl });');
    expect(script).not.toContain("gfOpenLink('1208', 'service', '0', '00', '', '');\n             return;");
  });

  it('uses grade-specific target detection for code 1220', () => {
    const script = buildServiceOpenScript('1220');

    expect(script).toContain('index_score|scoreListAll|StudentScore|studentscore');
    expect(script).not.toContain('PrjNo=1220|index_score|scoreListAll|StudentScore|studentscore');
    expect(script).not.toContain('PrjNo=1208|queryByStudent');
  });

  it('uses tutoring-specific target detection and ICAS fallback for code 1202', () => {
    const script = buildServiceOpenScript('1202');

    expect(script).toContain('TransUrl\\\\.aspx\\\\?PrjNo=1202|icas\\\\.pccu\\\\.edu\\\\.tw');
    expect(script).toContain('https://icas.pccu.edu.tw/cfp/');
    expect(script).not.toContain('https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse');
  });
});

describe('buildRobustGradePageScript', () => {
  it('resets active state instead of silently returning', () => {
    const script = buildRobustGradePageScript();

    expect(script).not.toContain('if (syncState.active) {\n          return;\n        }');
    expect(script).toContain('if (syncState.active) {');
    expect(script).toContain('syncState.active = false;');
  });

  it('falls back to direct history grade navigation from grade index pages', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('function isGradeMenuPage(url)');
    expect(script).toContain('function navigateToGradeHistoryPage(doc)');
    expect(script).toContain('scoreListAll.asp');
    expect(script).toContain("post({ t: 'status', m: '\\u76f4\\u63a5\\u5207\\u5230\\u6b77\\u5e74\\u6210\\u7e3e\\u55ae...' });");
  });

  it('does not treat index_score as the final historical grade result', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('var onHistoryPage = /scoreListAll/i.test(href);');
    expect(script).toContain('if (!onHistoryPage) return false;');
  });

  it('clicks the grade search control after reaching the history page', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('clickedSearch');
    expect(script).toContain('function findGradeSearchControl()');
    expect(script).toContain("post({ t: 'status', m: '\\u67e5\\u8a62\\u6b77\\u5e74\\u6210\\u7e3e\\u4e2d...' });");
  });

  it('prefers clicking the history tab before falling back to direct scoreListAll navigation', () => {
    const script = buildRobustGradePageScript();
    const historyTabIndex = script.indexOf('var historyInfo = findHistoryTab();');
    const clickIndex = script.indexOf('clickedHistory = click(historyTab);');
    const resolveUrlIndex = script.indexOf('var historyUrl = resolveNavTarget(historyDoc, historyTab);');
    const directFallbackIndex = script.indexOf(
      'if (attempts >= 4 && isGradeMenuPage(workUrl) && navigateToGradeHistoryPage(workDoc))'
    );

    expect(historyTabIndex).toBeGreaterThan(-1);
    expect(clickIndex).toBeGreaterThan(historyTabIndex);
    expect(resolveUrlIndex).toBeGreaterThan(clickIndex);
    expect(directFallbackIndex).toBeGreaterThan(resolveUrlIndex);
    expect(script).toContain('if (attempts >= 4 && isGradeMenuPage(workUrl) && navigateToGradeHistoryPage(workDoc))');
  });

  it('submits the grade history form when the search button is not discoverable', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('function findGradeQueryForm(doc)');
    expect(script).toContain('function submitGradeSearchForm(doc, form)');
    expect(script).toContain("form.querySelector('[name=\"hidChkSearch\"]')");
    expect(script).toContain("var searchAction = 'search';");
    expect(script).toContain('searchFlag.value = searchAction;');
    expect(script).toContain('form.submit();');
  });

  it('posts grade page probes so device logs reveal why history grades are empty', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('function postGradeProbe(label, doc, html)');
    expect(script).toContain("t: 'grade_probe'");
    expect(script).toContain("postGradeProbe('waiting-history-result'");
    expect(script).toContain("postGradeProbe('posting-fallback-html'");
  });

  it('keeps regex escapes intact inside the generated grade script', () => {
    const script = buildRobustGradePageScript();

    expect(script).toContain('replace(/\\s+/g');
    expect(script).toContain('[A-Z]{1,4}\\d{1,4}');
    expect(script).toContain('\\d{1,3}(?:\\.\\d+)?');
    expect(script).not.toContain('replace(/s+/g');
    expect(script).not.toContain('[A-Z]{1,4}d{1,4}');
  });
});
