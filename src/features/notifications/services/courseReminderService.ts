import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CourseData } from '../../pccu/parsers/pccuScraper';
import { getCourses } from '../../schedule/storage/scheduleStorage';
import {
  getCourseRemindersEnabled,
  getNotificationsEnabled,
} from '../../settings/storage/notificationSettings';
import {
  CourseReminderPresentationMode,
  getCourseReminderPresentationMode,
} from './courseReminderRuntime';

const COURSE_REMINDER_CHANNEL_ID = 'course-reminders';
const COURSE_REMINDER_KIND = 'course-reminder';
const REMINDER_LOOKAHEAD_DAYS = 7;
const REMINDER_MINUTES_BEFORE = 10;

const PERIOD_TIMES: Array<{ start: [number, number]; end: [number, number] }> = [
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

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

type ReminderOccurrence = {
  course: CourseData;
  start: Date;
  end: Date;
};

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatTime = (hours: number, minutes: number) => `${pad2(hours)}:${pad2(minutes)}`;
const toJsDay = (dayOfWeek: number) => ((dayOfWeek % 7) + 7) % 7;
const getCourseLocation = (course: CourseData) => course.location?.trim() || '教室未提供';

async function ensureNotificationPermissions() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync();
  return next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(COURSE_REMINDER_CHANNEL_ID, {
    name: '課程提醒',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

function buildOccurrence(course: CourseData, now: Date, dayOffset: number): ReminderOccurrence | null {
  const startSlot = PERIOD_TIMES[course.startPeriod - 1];
  const endSlot = PERIOD_TIMES[course.endPeriod - 1] || startSlot;
  if (!startSlot || !endSlot) return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(startSlot.start[0], startSlot.start[1], 0, 0);

  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + dayOffset);
  end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

  return { course, start, end };
}

function collectUpcomingOccurrences(courses: CourseData[], now: Date) {
  const occurrences: ReminderOccurrence[] = [];

  for (let dayOffset = 0; dayOffset < REMINDER_LOOKAHEAD_DAYS; dayOffset += 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    const jsDay = date.getDay();

    courses.forEach((course) => {
      if (toJsDay(course.dayOfWeek) !== jsDay) return;
      const occurrence = buildOccurrence(course, now, dayOffset);
      if (!occurrence) return;

      const reminderAt = new Date(occurrence.start.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000);
      if (reminderAt <= now) return;

      occurrences.push(occurrence);
    });
  }

  return occurrences.sort((left, right) => left.start.getTime() - right.start.getTime());
}

async function cancelExistingCourseReminderNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const targets = scheduled.filter((item) => item.content.data?.kind === COURSE_REMINDER_KIND);

  await Promise.all(targets.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

function buildReminderContent(
  occurrence: ReminderOccurrence,
  presentationMode: CourseReminderPresentationMode
): Notifications.NotificationContentInput {
  const location = getCourseLocation(occurrence.course);
  const weekday = WEEKDAY_LABELS[occurrence.start.getDay()];
  const timeRange = `${formatTime(occurrence.start.getHours(), occurrence.start.getMinutes())}-${formatTime(
    occurrence.end.getHours(),
    occurrence.end.getMinutes()
  )}`;

  return {
    title: presentationMode === 'dynamic-island' ? occurrence.course.name : '下節課即將開始',
    body: presentationMode === 'dynamic-island' ? `${timeRange} · ${location}` : `${occurrence.course.name} · ${location}`,
    subtitle: `${weekday} ${timeRange}`,
    sound: 'default',
    data: {
      kind: COURSE_REMINDER_KIND,
      courseName: occurrence.course.name,
      location,
      startsAt: occurrence.start.toISOString(),
      endsAt: occurrence.end.toISOString(),
      presentationMode,
      dynamicIsland: {
        compactLeading: occurrence.course.name,
        compactTrailing: location,
        expandedCourseName: occurrence.course.name,
        expandedTime: `${weekday} ${timeRange}`,
        expandedLocation: location,
      },
    },
  };
}

async function scheduleCourseReminderNotifications(courses: CourseData[]) {
  const now = new Date();
  const presentationMode = getCourseReminderPresentationMode();
  const upcoming = collectUpcomingOccurrences(courses, now);

  await Promise.all(
    upcoming.map((occurrence) =>
      Notifications.scheduleNotificationAsync({
        content: buildReminderContent(occurrence, presentationMode),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(occurrence.start.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000),
          channelId: Platform.OS === 'android' ? COURSE_REMINDER_CHANNEL_ID : undefined,
        },
      })
    )
  );
}

export { getCourseReminderPresentationMode } from './courseReminderRuntime';

export async function refreshScheduledCourseReminders(courses?: CourseData[] | null) {
  const [notificationsEnabled, courseRemindersEnabled] = await Promise.all([
    getNotificationsEnabled(),
    getCourseRemindersEnabled(),
  ]);

  await ensureNotificationChannel();
  await cancelExistingCourseReminderNotifications();

  if (!notificationsEnabled || !courseRemindersEnabled) {
    return;
  }

  const permissionGranted = await ensureNotificationPermissions();
  if (!permissionGranted) {
    return;
  }

  const nextCourses = courses ?? (await getCourses()).courses ?? [];
  if (!nextCourses || nextCourses.length === 0) {
    return;
  }

  await scheduleCourseReminderNotifications(nextCourses);
}
