import { AppSessionCoordinator } from '../core/session/AppSessionCoordinator';
import { clearRegisteredWebViewSession } from '../core/sync/webview/webViewSessionControl';
import { credentialVault } from '../features/auth/infrastructure/SecureStoreCredentialVault';
import { clearGrades } from '../features/grade/storage/gradeStorage';
import { PccuSyncEngine } from '../features/pccu/engine/PccuSyncEngine';
import { clearCourses } from '../features/schedule/storage/scheduleStorage';
import { useScheduleStore } from '../features/schedule/store/useScheduleStore';
import { clearTrafficSnapshot } from '../features/traffic/storage/trafficStorage';
import { clearAll as clearTutoring } from '../features/tutoring/storage/tutoringStorage';
import { useTutoringStore } from '../features/tutoring/store/useTutoringStore';
import { useGradeStore } from '../features/grade/store/useGradeStore';
import { consumeNextSessionCleanupFailure } from '../shared/testing/acceptanceFaults';

const rejectedReasons = (results: PromiseSettledResult<unknown>[]) =>
  results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);

const clearFeatureCaches = async (): Promise<void> => {
  const operations: Promise<unknown>[] = [
    clearCourses(),
    clearGrades(),
    clearTrafficSnapshot(),
    clearTutoring(),
  ];
  if (consumeNextSessionCleanupFailure()) {
    operations.push(Promise.reject(new Error('acceptance_cleanup_failure')));
  }

  const results = await Promise.allSettled(operations);
  const failures = rejectedReasons(results);
  if (failures.length > 0) {
    throw new AggregateError(failures, 'feature_cache_clear_failed');
  }
};

const resetFeatureStores = (): void => {
  const failures: unknown[] = [];
  const resets = [
    () => useScheduleStore.getState().resetData(),
    () => useGradeStore.getState().resetData(),
    () => useTutoringStore.getState().resetData(),
  ];

  for (const reset of resets) {
    try {
      reset();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'feature_store_reset_failed');
  }
};

export const appSessionCoordinator = new AppSessionCoordinator({
  sync: PccuSyncEngine.getInstance(),
  clearWebView: clearRegisteredWebViewSession,
  clearActiveCredentials: () => credentialVault.clearActive(),
  clearPersistentCredentials: () => credentialVault.clearPersisted(),
  clearProfile: () => credentialVault.clearProfile(),
  clearFeatureCaches,
  resetFeatureStores,
});
