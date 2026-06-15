import {
  buildLatestCourseMessage,
  buildTutoringCourseCards,
} from '../tutoringCourseCards';
import type { CourseDetail, TutoringCourse } from '../../types';

const course = (courseCode: string, courseName: string): TutoringCourse => ({
  courseCode,
  courseName,
  coCourseCode: '',
  deptName: '資訊管理學系',
  label: courseName,
  credit: 2,
  isRemote: false,
  announcementCount: 0,
  materialCount: 0,
  pollCount: 0,
  homeworkCount: 0,
  postCount: 0,
});

describe('tutoringCourseCards', () => {
  it('uses the newest assignment, announcement, or material as the latest message', () => {
    const detail: CourseDetail = {
      assignments: [
        {
          mySn: 1,
          homeSn: 2,
          courseCode: 'A',
          courseName: 'A',
          title: '期末作業',
          commentText: '',
          endAt: '2026-04-20 12:00',
          lastUpdatedAt: '2026-04-28 10:00',
          stateCode: '',
          stateLabel: '未繳交',
          reloadable: false,
          hasFile: false,
          usedCount: null,
          remainingSubmissionCount: null,
          maxSubmissionCount: null,
          reviewText: '',
          attachments: [],
        },
      ],
      announcements: [
        {
          serialNo: 3,
          courseCode: 'A',
          courseName: 'A',
          teacherName: '老師',
          title: '上課提醒',
          createdAt: '2026-04-29 09:00',
          isRead: false,
          contentHtml: '',
          contentText: '',
        },
      ],
      materials: [
        {
          targetNo: 4,
          courseCode: 'A',
          courseName: 'A',
          catalog: '',
          title: '第三週教材',
          fileName: 'week3.pdf',
          memoHtml: '',
          memoText: '',
          endAt: '',
          updatedAt: '2026-04-27 09:00',
          isNew: true,
          downable: true,
        },
      ],
    };

    expect(buildLatestCourseMessage(detail)).toEqual({
      message: '最新消息：公告｜上課提醒',
      timestamp: new Date('2026-04-29 09:00').getTime(),
    });
  });

  it('sorts courses by latest message timestamp descending', () => {
    const cards = buildTutoringCourseCards(
      [course('OLD', '舊課程'), course('NEW', '新課程')],
      new Map([
        ['OLD', { announcements: [], materials: [], assignments: [] }],
        [
          'NEW',
          {
            announcements: [
              {
                serialNo: 1,
                courseCode: 'NEW',
                courseName: '新課程',
                teacherName: '',
                title: '最新公告',
                createdAt: '2026-04-29 10:00',
                isRead: false,
                contentHtml: '',
                contentText: '',
              },
            ],
            materials: [],
            assignments: [],
          },
        ],
      ]),
    );

    expect(cards.map((card) => card.course.courseCode)).toEqual(['NEW', 'OLD']);
  });
});
