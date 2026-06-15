import type { CourseDetail, TutoringCourse } from '../types';

export type TutoringCourseCardViewModel = {
  course: TutoringCourse;
  latestMessage: string;
  latestAtMs: number;
};

function parseTimestamp(value?: string | null): number {
  if (!value) return 0;
  const normalized = String(value).replace(/\//g, '-').trim();
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function cleanText(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildLatestCourseMessage(detail?: CourseDetail): {
  message: string;
  timestamp: number;
} {
  const candidates: Array<{ type: string; title: string; timestamp: number }> = [];

  for (const assignment of detail?.assignments ?? []) {
    candidates.push({
      type: '作業',
      title: cleanText(assignment.title),
      timestamp: parseTimestamp(assignment.lastUpdatedAt || assignment.endAt),
    });
  }

  for (const announcement of detail?.announcements ?? []) {
    candidates.push({
      type: '公告',
      title: cleanText(announcement.title),
      timestamp: parseTimestamp(announcement.createdAt),
    });
  }

  for (const material of detail?.materials ?? []) {
    candidates.push({
      type: '教材',
      title: cleanText(material.title || material.fileName),
      timestamp: parseTimestamp(material.updatedAt || material.endAt),
    });
  }

  const latest = candidates
    .filter((candidate) => candidate.title || candidate.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!latest) {
    return {
      message: '最新消息：等待同步',
      timestamp: 0,
    };
  }

  return {
    message: `最新消息：${latest.type}｜${latest.title || '未命名項目'}`,
    timestamp: latest.timestamp,
  };
}

export function buildTutoringCourseCards(
  courses: TutoringCourse[],
  courseDetails: Map<string, CourseDetail>,
): TutoringCourseCardViewModel[] {
  return courses
    .map((course) => {
      const latest = buildLatestCourseMessage(courseDetails.get(course.courseCode));
      return {
        course,
        latestMessage: latest.message,
        latestAtMs: latest.timestamp,
      };
    })
    .sort((a, b) => {
      if (b.latestAtMs !== a.latestAtMs) return b.latestAtMs - a.latestAtMs;
      return a.course.courseName.localeCompare(b.course.courseName, 'zh-Hant');
    });
}
