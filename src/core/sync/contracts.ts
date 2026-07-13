export const SYNC_KINDS = [
  'grade',
  'schedule',
  'traffic',
  'tutoring',
  'tutoring-detail',
  'tutoring-download',
  'tutoring-upload',
] as const;

export type SyncKind = (typeof SYNC_KINDS)[number];
