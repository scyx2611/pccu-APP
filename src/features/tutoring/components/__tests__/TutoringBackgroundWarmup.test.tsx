jest.mock('../../hooks/useTutoringSync', () => ({
  useTutoringSync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { act, render } from '@testing-library/react-native';

import TutoringBackgroundWarmup from '../TutoringBackgroundWarmup';
import { useTutoringSync } from '../../hooks/useTutoringSync';
import { useTutoringStore } from '../../store/useTutoringStore';

const mockSync = jest.fn(async () => {});
const mockSyncCourseDetail = jest.fn(async () => {});

describe('TutoringBackgroundWarmup', () => {
  beforeEach(() => {
    mockSync.mockClear();
    mockSyncCourseDetail.mockClear();
    (useTutoringSync as jest.Mock).mockReturnValue({
      sync: mockSync,
      syncCourseDetail: mockSyncCourseDetail,
      syncInProgress: false,
    });
    useTutoringStore.setState({
      courses: [],
      courseDetails: new Map(),
      syncStatus: 'idle',
      syncPhase: 'idle',
      pendingAssignmentsCount: 0,
      pendingAssignments: [],
      lastSyncedAt: null,
      error: null,
      semester: '',
      welcomeText: '',
    });
  });

  it('starts a silent low-priority tutoring sync on app mount', async () => {
    render(<TutoringBackgroundWarmup />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledWith({ silent: true, priority: 6 });
  });

  it('does not warm up again when cached tutoring data is fresh', async () => {
    useTutoringStore.setState({
      courses: [
        {
          courseCode: 'CS101',
          coCourseCode: '',
          deptName: 'Dept',
          courseName: 'Course',
          label: 'Dept - Course',
          credit: 2,
          isRemote: false,
          announcementCount: 0,
          materialCount: 0,
          pollCount: 0,
          homeworkCount: 0,
          postCount: 0,
        },
      ],
      lastSyncedAt: new Date(),
    });

    render(<TutoringBackgroundWarmup />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('prefetches missing course details in the background', async () => {
    useTutoringStore.setState({
      courses: [
        {
          courseCode: 'CS101',
          coCourseCode: '',
          deptName: 'Dept',
          courseName: 'Course',
          label: 'Dept - Course',
          credit: 2,
          isRemote: false,
          announcementCount: 1,
          materialCount: 1,
          pollCount: 0,
          homeworkCount: 1,
          postCount: 0,
        },
      ],
      lastSyncedAt: new Date(),
    });

    render(<TutoringBackgroundWarmup />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSync).not.toHaveBeenCalled();
    expect(mockSyncCourseDetail).toHaveBeenCalledWith('CS101', {
      silent: true,
      priority: 6,
      force: true,
    });
  });

  it('prefetches cached course details again when secondary-page data is incomplete', async () => {
    useTutoringStore.setState({
      courses: [
        {
          courseCode: 'CS101',
          coCourseCode: '',
          deptName: 'Dept',
          courseName: 'Course',
          label: 'Dept - Course',
          credit: 2,
          isRemote: false,
          announcementCount: 2,
          materialCount: 1,
          pollCount: 0,
          homeworkCount: 1,
          postCount: 0,
        },
      ],
      courseDetails: new Map([
        [
          'CS101',
          {
            announcements: [],
            materials: [],
            assignments: [],
            courseInfo: {
              teacherName: '高荻華',
              academicYearTerm: '1142',
              departmentClass: 'U PCL 中文 1 (29)',
              requiredType: '必修',
              creditText: '2.0',
              englishLevel: 'N',
              scheduleText: '星期二, 02-03 大孝 0412',
              expectedEnrollment: '64',
            },
          },
        ],
      ]),
      lastSyncedAt: new Date(),
    });

    render(<TutoringBackgroundWarmup />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSyncCourseDetail).toHaveBeenCalledWith('CS101', {
      silent: true,
      priority: 6,
      force: true,
    });
  });

  it('skips background detail prefetch when the secondary page is complete', async () => {
    useTutoringStore.setState({
      courses: [
        {
          courseCode: 'CS101',
          coCourseCode: '',
          deptName: 'Dept',
          courseName: 'Course',
          label: 'Dept - Course',
          credit: 2,
          isRemote: false,
          announcementCount: 1,
          materialCount: 1,
          pollCount: 0,
          homeworkCount: 1,
          postCount: 0,
        },
      ],
      courseDetails: new Map([
        [
          'CS101',
          {
            announcements: [{} as any],
            materials: [{} as any],
            assignments: [{} as any],
            courseInfo: {
              teacherName: '高荻華',
              academicYearTerm: '1142',
              departmentClass: 'U PCL 中文 1 (29)',
              requiredType: '必修',
              creditText: '2.0',
              englishLevel: 'N',
              scheduleText: '星期二, 02-03 大孝 0412',
              expectedEnrollment: '64',
            },
          },
        ],
      ]),
      lastSyncedAt: new Date(),
    });

    render(<TutoringBackgroundWarmup />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSyncCourseDetail).not.toHaveBeenCalled();
  });
});
