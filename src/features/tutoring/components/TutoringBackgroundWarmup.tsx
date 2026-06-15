import { useEffect, useRef } from 'react';
import { useTutoringSync } from '../hooks/useTutoringSync';
import { useTutoringStore } from '../store/useTutoringStore';
import type { CourseDetail, TutoringCourse } from '../types';

const WARMUP_FRESH_MS = 5 * 60 * 1000;

function hasFreshTutoringData() {
  const { courses, lastSyncedAt } = useTutoringStore.getState();
  if (courses.length === 0 || !lastSyncedAt) return false;
  return Date.now() - lastSyncedAt.getTime() < WARMUP_FRESH_MS;
}

function hasExpectedCount(expected: number, actual: number) {
  return expected <= 0 || actual >= expected;
}

function isCourseDetailComplete(course: TutoringCourse, detail?: CourseDetail) {
  if (!detail?.courseInfo) return false;

  return (
    hasExpectedCount(course.announcementCount, detail.announcements.length) &&
    hasExpectedCount(course.materialCount, detail.materials.length) &&
    hasExpectedCount(course.homeworkCount, detail.assignments.length)
  );
}

export default function TutoringBackgroundWarmup() {
  const didStartRef = useRef(false);
  const prefetchedCourseCodesRef = useRef(new Set<string>());
  const courses = useTutoringStore((s) => s.courses);
  const courseDetails = useTutoringStore((s) => s.courseDetails);
  const hydrate = useTutoringStore((s) => s.hydrate);
  const { sync, syncCourseDetail } = useTutoringSync();

  useEffect(() => {
    if (didStartRef.current) return;
    didStartRef.current = true;

    let cancelled = false;

    const warmup = async () => {
      if (hasFreshTutoringData()) return;

      await hydrate();
      if (cancelled || hasFreshTutoringData()) return;

      await sync({ silent: true, priority: 6 });
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [hydrate, sync]);

  useEffect(() => {
    if (courses.length === 0) return;

    let cancelled = false;

    const prefetchDetails = async () => {
      for (const course of courses) {
        if (cancelled) return;

        const courseCode = String(course.courseCode || '').trim();
        if (!courseCode) continue;
        if (isCourseDetailComplete(course, courseDetails.get(courseCode))) continue;
        if (prefetchedCourseCodesRef.current.has(courseCode)) continue;

        prefetchedCourseCodesRef.current.add(courseCode);
        await syncCourseDetail(courseCode, { silent: true, priority: 6, force: true });
      }
    };

    void prefetchDetails();

    return () => {
      cancelled = true;
    };
  }, [courses, courseDetails, syncCourseDetail]);

  return null;
}
