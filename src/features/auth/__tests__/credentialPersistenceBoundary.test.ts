import fs from 'fs';
import path from 'path';

const authRoot = path.resolve(__dirname, '..');
const authServicePath = path.join(authRoot, 'services', 'authService.ts');
const vaultPath = path.join(authRoot, 'infrastructure', 'SecureStoreCredentialVault.ts');
const appIndexPath = path.resolve(__dirname, '../../../../app/index.tsx');
const loginScreenPath = path.join(authRoot, 'screens', 'LoginScreen.tsx');

const read = (filePath: string) => fs.readFileSync(filePath, 'utf8');

const collectProductionAuthSources = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectProductionAuthSources(entryPath);
    }
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });

describe('credential persistence boundary', () => {
  it('keeps the legacy plaintext mirror literal only in its deletion migration', () => {
    const mirrorOwners = collectProductionAuthSources(authRoot)
      .filter((filePath) => read(filePath).includes('user_credentials_cache_v1'))
      .map((filePath) => path.relative(authRoot, filePath).replace(/\\/g, '/'));

    expect(mirrorOwners).toEqual(['infrastructure/SecureStoreCredentialVault.ts']);
  });

  it('never writes credentials through AsyncStorage', () => {
    const authServiceSource = read(authServicePath);
    const vaultSource = read(vaultPath);

    expect(authServiceSource).not.toContain('@react-native-async-storage/async-storage');
    expect(authServiceSource).not.toMatch(/AsyncStorage\.setItem/);
    expect(vaultSource).not.toMatch(/AsyncStorage\.setItem/);
    expect(vaultSource).toContain('AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY)');
  });

  it.each([
    ['app bootstrap', appIndexPath],
    ['login bootstrap', loginScreenPath],
  ])('signs out safely when the %s cannot read the vault', (_label, filePath) => {
    const source = read(filePath);

    expect(source).toContain('clearSavedPCCUCredentials');
    expect(source).toMatch(
      /try\s*{[\s\S]*?getSavedPCCUCredentials\(\)[\s\S]*?}\s*catch\s*{[\s\S]*?clearSavedPCCUCredentials\(\)\.catch/,
    );
  });
});
