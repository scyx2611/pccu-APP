import { create } from 'zustand';
import {
  type TutoringStoreState,
  type TutoringCourse,
  type TutoringAssignment,
  type CourseDetail,
  type SyncPhase,
  type SyncStatus,
} from '../types';
import * as tutoringStorage from '../storage/tutoringStorage';

interface TutoringStoreActions {
  setCourses: (courses: TutoringCourse[]) => void;
  setPendingAssignments: (assignments: TutoringAssignment[]) => void;
  updateCourseDetail: (courseCode: string, detail: CourseDetail) => void;
  setSyncPhase: (phase: SyncPhase) => void;
  setSyncStatus: (status: SyncStatus) => void;
  resetSync: () => void;
  setError: (error: string | null) => void;
  setSemester: (semester: string) => void;
  setWelcomeText: (text: string) => void;
  setLastSyncedAt: (timestamp: number | null) => void;
  hydrate: () => Promise<void>;
}

export type UseTutoringStore = TutoringStoreState & TutoringStoreActions;

export const useTutoringStore = create<UseTutoringStore>()((set) => ({
  // Initial state
  courses: [],
  courseDetails: new Map<string, CourseDetail>(),
  syncStatus: 'idle',
  syncPhase: 'idle',
  pendingAssignmentsCount: 0,
  pendingAssignments: [],
  lastSyncedAt: null,
  error: null,
  semester: '',
  welcomeText: '',

  // Actions
  setCourses: (courses) => set({ courses }),

  setPendingAssignments: (pendingAssignments) =>
    set({ pendingAssignments, pendingAssignmentsCount: pendingAssignments.length }),

  updateCourseDetail: (courseCode, detail) =>
    set((state) => {
      const next = new Map(state.courseDetails);
      const current = next.get(courseCode);
      next.set(courseCode, {
        announcements: detail.announcements ?? current?.announcements ?? [],
        materials: detail.materials ?? current?.materials ?? [],
        assignments: detail.assignments ?? current?.assignments ?? [],
        progress: detail.progress ?? current?.progress ?? [],
        classmates: detail.classmates ?? current?.classmates ?? [],
        courseInfo: detail.courseInfo ?? current?.courseInfo,
      });
      return { courseDetails: next };
    }),

  setSyncPhase: (syncPhase) => set({ syncPhase }),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

  resetSync: () => set({ syncStatus: 'idle', syncPhase: 'idle', error: null }),

  setError: (error) => set({ error, syncStatus: 'error', syncPhase: 'error' }),

  setSemester: (semester) => set({ semester }),

  setWelcomeText: (welcomeText) => set({ welcomeText }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp ? new Date(timestamp) : null }),

  hydrate: async () => {
    try {
      const [courses, pendingAssignments] = await Promise.all([
        tutoringStorage.getCourses(),
        tutoringStorage.getPendingAssignments(),
      ]);
      const courseDetails = new Map<string, CourseDetail>();

      await Promise.all(
        (courses ?? []).map(async (course) => {
          const courseCode = String(course.courseCode || '').trim();
          if (!courseCode) return;

          const [announcements, materials, assignments, progress, classmates, courseInfo] =
            await Promise.all([
              tutoringStorage.getCourseDetail(courseCode, 'announcements'),
              tutoringStorage.getCourseDetail(courseCode, 'materials'),
              tutoringStorage.getCourseDetail(courseCode, 'assignments'),
              tutoringStorage.getCourseDetail(courseCode, 'progress'),
              tutoringStorage.getCourseDetail(courseCode, 'classmates'),
              tutoringStorage.getCourseInfo(courseCode),
            ]);

          if (announcements || materials || assignments || progress || classmates || courseInfo) {
            const detail: CourseDetail = {
              announcements: announcements ?? [],
              materials: materials ?? [],
              assignments: assignments ?? [],
              courseInfo: courseInfo ?? undefined,
            };
            if (progress) {
              detail.progress = progress;
            }
            if (classmates) {
              detail.classmates = classmates;
            }
            courseDetails.set(courseCode, detail);
          }
        }),
      );

      set({
        courses: courses ?? [],
        courseDetails,
        pendingAssignments: pendingAssignments ?? [],
        pendingAssignmentsCount: pendingAssignments?.length ?? 0,
      });
    } catch (error) {
      console.error('[TutoringStore] Hydration failed:', error);
      set({ error: 'Failed to load cached data' });
    }
  },
}));
