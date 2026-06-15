import * as DocumentPicker from 'expo-document-picker';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Sharing from 'expo-sharing';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';

export type TutoringDownloadAction = {
  courseCode: string;
  kind: 'announcement' | 'material' | 'assignment' | 'submitted';
  fileName?: string;
  downloadUrl?: string;
  targetNo?: number | null;
  serialNo?: number | null;
  homeSn?: number | null;
};

type DownloadResult = {
  success: boolean;
  fileName: string;
  mimeType: string;
  base64: string;
};

type NativeFileSystemModule = {
  cacheDirectory?: string | null;
  readAsStringAsync?: (fileUri: string, options?: { encoding?: string }) => Promise<string>;
  writeAsStringAsync?: (
    fileUri: string,
    contents: string,
    options?: { encoding?: string },
  ) => Promise<void>;
};

const nativeFileSystem =
  requireOptionalNativeModule<NativeFileSystemModule>('ExponentFileSystem') ?? null;

function getNativeFileSystem() {
  if (
    !nativeFileSystem?.cacheDirectory ||
    typeof nativeFileSystem.readAsStringAsync !== 'function' ||
    typeof nativeFileSystem.writeAsStringAsync !== 'function'
  ) {
    throw new Error('檔案系統尚未載入，請重新啟動 App 後再試一次');
  }
  return nativeFileSystem;
}

function sanitizeFileName(value?: string | null) {
  const cleaned = String(value || 'tutoring-file')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'tutoring-file';
}

export async function downloadTutoringFile(action: TutoringDownloadAction) {
  const engine = PccuSyncEngine.getInstance();
  await engine.waitForExecutorReady();

  const result = (await engine.requestSync('tutoring-download', 3, action)) as DownloadResult;
  if (!result?.success || !result.base64) {
    throw new Error('附件下載失敗。');
  }

  const fileName = sanitizeFileName(result.fileName || action.fileName);
  const fileSystem = getNativeFileSystem();
  const targetUri = `${fileSystem.cacheDirectory}${fileName}`;
  await fileSystem.writeAsStringAsync!(targetUri, result.base64, {
    encoding: 'base64',
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(targetUri, {
      mimeType: result.mimeType || 'application/octet-stream',
      UTI: result.mimeType || 'public.data',
    });
  }

  return targetUri;
}

export async function uploadTutoringAssignmentFile(courseCode: string, homeSn: number | null) {
  if (homeSn == null) {
    throw new Error('找不到作業識別碼，無法上傳。');
  }

  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked?.canceled) {
    return { canceled: true };
  }

  const asset = Array.isArray(picked?.assets) ? picked.assets[0] : picked;
  if (!asset?.uri) {
    throw new Error('沒有選取檔案。');
  }

  const fileSystem = getNativeFileSystem();
  const base64 = await fileSystem.readAsStringAsync!(asset.uri, {
    encoding: 'base64',
  });

  const engine = PccuSyncEngine.getInstance();
  await engine.waitForExecutorReady();
  const result = await engine.requestSync('tutoring-upload', 2, {
    courseCode,
    homeSn,
    fileName: sanitizeFileName(asset.name),
    mimeType: asset.mimeType || 'application/octet-stream',
    base64,
  });

  return {
    canceled: false,
    result,
  };
}
