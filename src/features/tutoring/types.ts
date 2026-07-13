export type TutoringCourse = {
  courseCode: string;
  coCourseCode: string;
  deptName: string;
  courseName: string;
  label: string;
  credit: number | null;
  isRemote: boolean;
  announcementCount: number;
  materialCount: number;
  pollCount: number;
  homeworkCount: number;
  postCount: number;
};

export type TutoringCourseInfo = {
  teacherName: string;
  academicYearTerm: string;
  departmentClass: string;
  requiredType: string;
  creditText: string;
  englishLevel: string;
  scheduleText: string;
  expectedEnrollment: string;
};

export type TutoringAnnouncement = {
  serialNo: number | null;
  courseCode: string;
  courseName: string;
  teacherName: string;
  title: string;
  createdAt: string;
  isRead: boolean;
  contentHtml: string;
  contentText: string;
  attachments?: TutoringFileAttachment[];
};

export type TutoringFileAttachment = {
  serialNo: number | null;
  targetNo: number | null;
  title: string;
  fileName: string;
  downloadUrl?: string;
};

export type TutoringMaterial = {
  targetNo: number | null;
  courseCode: string;
  courseName: string;
  catalog: string;
  title: string;
  fileName: string;
  memoHtml: string;
  memoText: string;
  endAt: string;
  updatedAt: string;
  isNew: boolean;
  downable: boolean;
  downloadUrl?: string;
};

export type TutoringAssignment = {
  mySn: number | null;
  homeSn: number | null;
  courseCode: string;
  courseName: string;
  title: string;
  commentText: string;
  endAt: string;
  lastUpdatedAt: string;
  stateCode: string;
  stateLabel: string;
  reloadable: boolean;
  hasFile: boolean;
  usedCount: number | null;
  remainingSubmissionCount: number | null;
  maxSubmissionCount: number | null;
  reviewText: string;
  attachments?: TutoringFileAttachment[];
  submittedFiles?: TutoringFileAttachment[];
  uploadable?: boolean;
};

export type TutoringProgressItem = {
  id: string;
  title: string;
  value: string;
  percent: number | null;
};

export type TutoringClassmate = {
  id: string;
  name: string;
  departmentClass: string;
  email: string;
};

export type TutoringSnapshot = {
  courses: TutoringCourse[];
  pendingAssignmentCount: number;
  updatedAt: number;
  semester: string;
  welcome: string;
};

export type TutoringSyncResult = {
  success: boolean;
  updatedAt: number | null;
  counts: {
    courses: number;
    pendingAssignments: number;
  };
  message?: string;
};

export type SyncPhase =
  | 'idle'
  | 'logging_in'
  | 'fetching_courses'
  | 'fetching_details'
  | 'complete'
  | 'error';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface CourseDetail {
  announcements: TutoringAnnouncement[];
  materials: TutoringMaterial[];
  assignments: TutoringAssignment[];
  progress?: TutoringProgressItem[];
  classmates?: TutoringClassmate[];
  courseInfo?: TutoringCourseInfo;
}

export interface TutoringStoreState {
  courses: TutoringCourse[];
  courseDetails: Map<string, CourseDetail>;
  syncStatus: SyncStatus;
  syncPhase: SyncPhase;
  pendingAssignmentsCount: number;
  pendingAssignments: TutoringAssignment[];
  lastSyncedAt: Date | null;
  error: string | null;
  semester: string;
  welcomeText: string;
}

export const TUTORING_BASE_URL = 'https://icas.pccu.edu.tw';
export const TUTORING_HOME_URL = `${TUTORING_BASE_URL}/cfp/`;
export const TUTORING_FUNCTION_CODE = '1202';
