const mockValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockValues.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockValues.delete(key);
  }),
  getAllKeys: jest.fn(async () => [...mockValues.keys()]),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => mockValues.delete(key));
  }),
}));

import { clearGrades, getGrades, setGrades } from '../grade/storage/gradeStorage';
import {
  clearCourses,
  getCourses as getSchedule,
  setCourses,
} from '../schedule/storage/scheduleStorage';
import {
  clearTrafficSnapshot,
  getTrafficSnapshot,
  setTrafficSnapshot,
} from '../traffic/storage/trafficStorage';
import {
  clearAll,
  getCourses as getTutoringCourses,
  setCourses as setTutoringCourses,
} from '../tutoring/storage/tutoringStorage';
import type { CourseData, SemesterGrade } from '../pccu/parsers/pccuScraper';
import type { TrafficSnapshot } from '../traffic/types';
import type { TutoringCourse } from '../tutoring/types';

// Phase 0 keeps these legacy keys/shapes until account-scoped repositories replace them in Phase 3.
describe('Phase 0 legacy persistence characterization', () => {
  beforeEach(async () => {
    mockValues.clear();
    await Promise.all([clearGrades(), clearCourses(), clearTrafficSnapshot(), clearAll()]);
  });

  it('round-trips grade and schedule snapshots with their timestamps', async () => {
    const grades: SemesterGrade[] = [{ title: '113-1', stats: {}, courses: [] }];
    const courses: CourseData[] = [
      {
        name: '資料結構',
        teacher: '王老師',
        location: '大孝館',
        required: true,
        type: '必修',
        dayOfWeek: 1,
        periodRange: '星期一 第 1-2 節',
        startPeriod: 1,
        endPeriod: 2,
      },
    ];

    await setGrades(grades, [], 101);
    await setCourses(courses, false, 202);

    await expect(getGrades()).resolves.toMatchObject({ grades, updatedAt: 101 });
    await expect(getSchedule()).resolves.toMatchObject({ courses, updatedAt: 202 });
  });

  it('round-trips traffic and tutoring data used by current hooks', async () => {
    const traffic: TrafficSnapshot = {
      downhill: [],
      uphill: [],
      updatedAt: 303,
      sourceUrl: 'https://ebus.gov.taipei',
    };
    const tutoring: TutoringCourse[] = [
      {
        courseCode: 'CS101',
        coCourseCode: 'CO-CS101',
        deptName: '資訊工程學系',
        courseName: '程式設計',
        label: '必修',
        credit: 3,
        isRemote: false,
        announcementCount: 1,
        materialCount: 2,
        pollCount: 0,
        homeworkCount: 3,
        postCount: 4,
      },
    ];

    await setTrafficSnapshot(traffic);
    await setTutoringCourses(tutoring);

    await expect(getTrafficSnapshot()).resolves.toEqual(traffic);
    await expect(getTutoringCourses()).resolves.toEqual(tutoring);
  });
});
