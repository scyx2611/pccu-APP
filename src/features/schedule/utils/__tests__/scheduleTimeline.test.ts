import { CourseData } from '../../../pccu/parsers/pccuScraper';
import {
  buildScheduleDateChips,
  formatCourseTimeRange,
  getTimelineCourseStatus,
} from '../scheduleTimeline';

const makeCourse = (overrides: Partial<CourseData> = {}): CourseData => ({
  name: '計算機概論',
  teacher: '王老師',
  location: '大恩館 101',
  required: true,
  type: '必修',
  dayOfWeek: 3,
  periodRange: '',
  startPeriod: 2,
  endPeriod: 3,
  ...overrides,
});

describe('schedule timeline helpers', () => {
  it('builds weekday chips and highlights the current day when the schedule has weekday courses', () => {
    const chips = buildScheduleDateChips(
      [
        makeCourse({ dayOfWeek: 1 }),
        makeCourse({ dayOfWeek: 2 }),
        makeCourse({ dayOfWeek: 3 }),
        makeCourse({ dayOfWeek: 4 }),
        makeCourse({ dayOfWeek: 5 }),
      ],
      new Date('2026-04-22T10:30:00+08:00')
    );

    expect(chips).toHaveLength(5);
    expect(chips.map((chip) => chip.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(chips.find((chip) => chip.isSelected)).toMatchObject({
      dayOfWeek: 3,
      weekdayLabel: '週三',
      dayNumber: '22',
    });
  });

  it('falls back to a Monday-to-Friday strip when no courses are available', () => {
    const chips = buildScheduleDateChips([], new Date('2026-04-22T10:30:00+08:00'));

    expect(chips.map((chip) => chip.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(chips[0]).toMatchObject({ weekdayLabel: '週一', dayNumber: '20' });
    expect(chips[4]).toMatchObject({ weekdayLabel: '週五', dayNumber: '24' });
  });

  it('classifies completed, active, and upcoming timeline states from the actual class time window', () => {
    const course = makeCourse({ dayOfWeek: 3, startPeriod: 2, endPeriod: 3 });
    const selectedDate = new Date('2026-04-22T00:00:00+08:00');

    expect(getTimelineCourseStatus(course, selectedDate, new Date('2026-04-22T08:50:00+08:00'))).toBe('upcoming');
    expect(getTimelineCourseStatus(course, selectedDate, new Date('2026-04-22T09:30:00+08:00'))).toBe('active');
    expect(getTimelineCourseStatus(course, selectedDate, new Date('2026-04-22T11:10:00+08:00'))).toBe('completed');
  });

  it('formats a merged period range into a readable time range', () => {
    expect(formatCourseTimeRange(makeCourse({ startPeriod: 2, endPeriod: 4 }))).toBe('09:10 - 12:00');
  });
});
