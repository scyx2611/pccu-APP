import { CourseData } from '../../pccu/parsers/pccuScraper';

export type TimelineCourseStatus = 'completed' | 'active' | 'upcoming';

export type ScheduleDateChip = {
  dayOfWeek: number;
  date: Date;
  weekdayLabel: string;
  shortWeekdayLabel: string;
  dayNumber: string;
  isSelected: boolean;
  isToday: boolean;
};

export const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const;

export const PERIOD_TIMES: { start: [number, number]; end: [number, number] }[] = [
  { start: [8, 10], end: [9, 0] },
  { start: [9, 10], end: [10, 0] },
  { start: [10, 10], end: [11, 0] },
  { start: [11, 10], end: [12, 0] },
  { start: [12, 10], end: [13, 0] },
  { start: [13, 10], end: [14, 0] },
  { start: [14, 10], end: [15, 0] },
  { start: [15, 10], end: [16, 0] },
  { start: [16, 10], end: [17, 0] },
  { start: [17, 10], end: [18, 0] },
  { start: [18, 10], end: [19, 0] },
  { start: [19, 10], end: [20, 0] },
  { start: [20, 10], end: [21, 0] },
  { start: [21, 10], end: [22, 0] },
  { start: [22, 10], end: [23, 0] },
  { start: [23, 10], end: [23, 59] },
];

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatTime = (hours: number, minutes: number) => `${pad2(hours)}:${pad2(minutes)}`;

export const toJsDay = (dayOfWeek: number) => ((dayOfWeek % 7) + 7) % 7;

const startOfWeekMonday = (date: Date) => {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
};

export const getDateForDayOfWeek = (anchorDate: Date, dayOfWeek: number) => {
  const start = startOfWeekMonday(anchorDate);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const value = new Date(start);
  value.setDate(start.getDate() + offset);
  return value;
};

const getVisibleDayOrder = (courses: CourseData[]) => {
  const days = Array.from(new Set(courses.map((course) => toJsDay(course.dayOfWeek))))
    .filter((day) => day >= 1 && day <= 6)
    .sort((a, b) => a - b);

  return days.length > 0 ? days : [1, 2, 3, 4, 5];
};

export const buildScheduleDateChips = (
  courses: CourseData[],
  anchorDate: Date,
  selectedDayOfWeek = toJsDay(anchorDate.getDay()),
): ScheduleDateChip[] =>
  getVisibleDayOrder(courses).map((dayOfWeek) => {
    const date = getDateForDayOfWeek(anchorDate, dayOfWeek);
    return {
      dayOfWeek,
      date,
      weekdayLabel: WEEKDAY_LABELS[dayOfWeek],
      shortWeekdayLabel: WEEKDAY_LABELS[dayOfWeek].replace('週', ''),
      dayNumber: pad2(date.getDate()),
      isSelected: dayOfWeek === selectedDayOfWeek,
      isToday: dayOfWeek === toJsDay(anchorDate.getDay()),
    };
  });

export const formatScheduleFullDate = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_LABELS[date.getDay()]}`;

export const buildCourseWindowForDate = (course: CourseData, anchorDate: Date) => {
  const slot = PERIOD_TIMES[course.startPeriod - 1];
  const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
  if (!slot || !endSlot) return null;

  const targetDate = getDateForDayOfWeek(anchorDate, toJsDay(course.dayOfWeek));
  const start = new Date(targetDate);
  start.setHours(slot.start[0], slot.start[1], 0, 0);

  const end = new Date(targetDate);
  end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

  return { start, end };
};

export const getTimelineCourseStatus = (
  course: CourseData,
  anchorDate: Date,
  now: Date,
): TimelineCourseStatus => {
  const window = buildCourseWindowForDate(course, anchorDate);
  if (!window) return 'upcoming';
  if (now > window.end) return 'completed';
  if (now >= window.start && now <= window.end) return 'active';
  return 'upcoming';
};

export const formatCourseTimeRange = (course: CourseData) => {
  const slot = PERIOD_TIMES[course.startPeriod - 1];
  const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
  if (!slot || !endSlot) return '';
  return `${formatTime(slot.start[0], slot.start[1])} - ${formatTime(endSlot.end[0], endSlot.end[1])}`;
};

export const getCoursesForScheduleDay = (courses: CourseData[], dayOfWeek: number) =>
  courses
    .filter((course) => toJsDay(course.dayOfWeek) === dayOfWeek)
    .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod);
