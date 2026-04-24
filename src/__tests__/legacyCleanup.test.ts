import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function getAllSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      files.push(...getAllSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkNoLegacyImports(files: string[]): string[] {
  const legacyPattern = /from\s+['"].*src\/(services|components|contexts|screens)\//;
  const violations: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (legacyPattern.test(lines[i])) {
        violations.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }

  return violations;
}

describe('Legacy cleanup regression guard', () => {
  it('legacy directories do not exist', () => {
    const legacyDirs = [
      path.join(PROJECT_ROOT, 'src', 'contexts'),
      path.join(PROJECT_ROOT, 'src', 'services'),
      path.join(PROJECT_ROOT, 'src', 'screens'),
      path.join(PROJECT_ROOT, 'src', 'components'),
    ];

    for (const dir of legacyDirs) {
      expect(fs.existsSync(dir)).toBe(false);
    }
  });

  it('no legacy imports in app/ directory', () => {
    const appDir = path.join(PROJECT_ROOT, 'app');
    const files = getAllSourceFiles(appDir);
    const violations = checkNoLegacyImports(files);
    expect(violations).toEqual([]);
  });

  it('no legacy imports in src/features/ directory', () => {
    const featuresDir = path.join(PROJECT_ROOT, 'src', 'features');
    const files = getAllSourceFiles(featuresDir);
    const violations = checkNoLegacyImports(files);
    expect(violations).toEqual([]);
  });

  it('no legacy imports in src/shared/ directory', () => {
    const sharedDir = path.join(PROJECT_ROOT, 'src', 'shared');
    const files = getAllSourceFiles(sharedDir);
    const violations = checkNoLegacyImports(files);
    expect(violations).toEqual([]);
  });

  it('HomeScreen uses new architecture paths only', () => {
    const homeScreenPath = path.join(
      PROJECT_ROOT,
      'src',
      'features',
      'home',
      'screens',
      'HomeScreen.tsx',
    );
    const content = fs.readFileSync(homeScreenPath, 'utf8');

    expect(content).not.toMatch(/from\s+['"].*src\/services\//);
    expect(content).not.toMatch(/from\s+['"].*src\/components\//);
    expect(content).not.toMatch(/from\s+['"].*src\/contexts\//);

    expect(content).toMatch(/pccuScraper/);
    expect(content).toMatch(/gradeStorage/);
    expect(content).toMatch(/AppSymbol/);
  });

  it('TrafficScreen has no TrafficSyncAgent or WebView import', () => {
    const trafficScreenPath = path.join(
      PROJECT_ROOT,
      'src',
      'features',
      'traffic',
      'screens',
      'TrafficScreen.tsx',
    );
    const content = fs.readFileSync(trafficScreenPath, 'utf8');

    expect(content).not.toContain('TrafficSyncAgent');
    expect(content).not.toMatch(/from\s+['"]react-native-webview['"]/);
  });

  it('TutoringScreen has no WebView import', () => {
    const tutoringScreenPath = path.join(
      PROJECT_ROOT,
      'src',
      'features',
      'tutoring',
      'screens',
      'TutoringScreen.tsx',
    );
    const content = fs.readFileSync(tutoringScreenPath, 'utf8');

    expect(content).not.toMatch(/from\s+['"]react-native-webview['"]/);
  });

  it('TutoringCourseDetailScreen has no WebView import', () => {
    const detailScreenPath = path.join(
      PROJECT_ROOT,
      'src',
      'features',
      'tutoring',
      'screens',
      'TutoringCourseDetailScreen.tsx',
    );
    const content = fs.readFileSync(detailScreenPath, 'utf8');

    expect(content).not.toMatch(/from\s+['"]react-native-webview['"]/);
  });
});
