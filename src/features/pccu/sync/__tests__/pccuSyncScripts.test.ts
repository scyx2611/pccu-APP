import {
  buildAdaptiveSchedulePageScript,
  buildRobustGradePageScript,
  buildRobustSchedulePageScript,
  buildServiceOpenScript,
} from '../pccuSyncScripts';

describe('buildAdaptiveSchedulePageScript', () => {
  it('uses queryByStudent form submit strategy without gfOpenLink dependency', () => {
    const script = buildAdaptiveSchedulePageScript();

    expect(script).toContain('queryByStudent.asp?QuerySource=queryCourse');
    expect(script).toContain('findQueryForm');
    expect(script).toContain('resolveFormAction');
    expect(script).toContain('submitQueryForm');
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

  it('uses grade-specific target detection for code 1220', () => {
    const script = buildServiceOpenScript('1220');

    expect(script).toContain('PrjNo=1220|index_score|scoreListAll|StudentScore|studentscore');
    expect(script).not.toContain('PrjNo=1208|queryByStudent');
  });
});

describe('buildRobustGradePageScript', () => {
  it('resets active state instead of silently returning', () => {
    const script = buildRobustGradePageScript();

    expect(script).not.toContain('if (syncState.active) {\n          return;\n        }');
    expect(script).toContain('if (syncState.active) {');
    expect(script).toContain('syncState.active = false;');
  });
});
