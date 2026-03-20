import { getGrades } from '../../grade/storage/gradeStorage';
import { getCourses } from '../../schedule/storage/scheduleStorage';

export type BootstrapCacheSnapshot = {
  hasScheduleCache: boolean;
  hasGradeCache: boolean;
  hasAnyCache: boolean;
};

export const getBootstrapCacheSnapshot = async (): Promise<BootstrapCacheSnapshot> => {
  const [scheduleCache, gradeCache] = await Promise.all([getCourses(), getGrades()]);

  const hasScheduleCache = !!scheduleCache.courses?.length && !scheduleCache.mock;
  const hasGradeCache = !!gradeCache.grades?.length;

  return {
    hasScheduleCache,
    hasGradeCache,
    hasAnyCache: hasScheduleCache || hasGradeCache,
  };
};
