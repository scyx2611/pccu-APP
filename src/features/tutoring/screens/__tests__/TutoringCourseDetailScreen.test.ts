import fs from 'fs';
import path from 'path';

describe('TutoringCourseDetailScreen bottom-tab-style tabs', () => {
  it('uses main bottom tab style icons and grayscale selection', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('icon: { default:');
    expect(source).toContain('active ? BOTTOM_TAB_SELECTED_COLOR : BOTTOM_TAB_IDLE_COLOR');
    expect(source).toContain('active ? tab.icon.selected : tab.icon.default');
    expect(source).toContain('styles.segmentIconWrap');
    expect(source).not.toContain('floatingSegmentIndicator');
    expect(source).not.toContain('@react-native-segmented-control/segmented-control');
    expect(source).not.toContain('<SegmentedControl');
    expect(source).not.toContain('styles.segmentButton');
  });

  it('keeps counts inline with the tab labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('tabValues');
    expect(source).toContain('styles.segmentTabActiveText');
    expect(source).toContain('styles.segmentCountText');
    expect(source).not.toContain('segmentCountLine');
  });

  it('keeps the whole control material consistent with the main bottom tabs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('BOTTOM_TAB_SELECTED_COLOR');
    expect(source).toContain('BOTTOM_TAB_IDLE_COLOR');
    expect(source).toContain('TAB_MATERIAL_COLORS');
    expect(source).toContain('TOP_TAB_MATERIAL');
    expect(source).toContain('SEGMENTED_CONTROL_MATERIAL');
    expect(source).toContain('backgroundColor: SEGMENTED_CONTROL_MATERIAL');
    expect(source).toContain('borderColor: SEGMENTED_CONTROL_BORDER');
    expect(source).toContain('backgroundColor: SEGMENTED_CONTROL_ACTIVE_MATERIAL');
    expect(source).not.toContain('style={[styles.segmentedControl, { backgroundColor: theme.card');
  });

  it('treats progress and classmates as required detail sections before skipping sync', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('function hasLoadedCourseDetailSection');
    expect(source).toContain("hasLoadedCourseDetailSection(courseDetail, 'progress')");
    expect(source).toContain("hasLoadedCourseDetailSection(courseDetail, 'classmates')");
    expect(source).toContain('needsSupplementalCourseDetail');
  });

  it('forces one progress refresh when an old empty progress cache is shown', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('progressRefreshAttemptRef');
    expect(source).toContain("activeTab === 'progress'");
    expect(source).toContain("syncCourseDetail(courseCode, { force: true })");
  });

  it('forces one progress refresh when old cache contains unrelated course-list rows', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('function hasSuspiciousProgressRows');
    expect(source).toContain('hasSuspiciousProgressRows(progress)');
    expect(source).toContain('hasLeadingJunk');
    expect(source).toContain('hasScheduleDates && !hasWeekTitles');
  });

  it('shows the course code inside the course detail card', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain("label: '課程代號'");
    expect(source).toContain('value: courseCode');
  });

  it('normalizes route and cached text before rendering course titles and progress', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain("import { normalizeTutoringText } from '../utils/text'");
    expect(source).toContain('const resolvedCourseName = cleanText(courseName || course?.courseName || courseCode)');
    expect(source).toContain('cleanText(item.title)');
    expect(source).toContain('cleanText(classmate.name)');
  });

  it('formats announcement previews and detail bodies instead of collapsing all fields together', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    expect(source).toContain('function formatAnnouncementPreview');
    expect(source).toContain('function formatAnnouncementBody');
    expect(source).toContain('formatAnnouncementPreview(announcement)');
    expect(source).toContain('formatAnnouncementBody(');
    expect(source).toContain('numberOfLines={2}');
  });
});
