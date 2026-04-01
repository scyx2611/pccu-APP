import { buildAdaptiveSchedulePageScript } from '../pccuSyncScripts';

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
});
