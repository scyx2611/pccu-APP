export type PCCUCredentials = Readonly<{
  account: string;
  password: string;
}>;

export type CredentialMigrationResult =
  | { status: 'ready'; credentials: PCCUCredentials }
  | { status: 'requires_sign_in' };

export interface CredentialVault {
  migrateV2(): Promise<CredentialMigrationResult>;
  getSaved(): Promise<PCCUCredentials | null>;
  getActive(): PCCUCredentials | null;
  save(credentials: PCCUCredentials): Promise<void>;
  setActive(credentials: PCCUCredentials): void;
  clearActive(): void;
  clearPersisted(): Promise<void>;
  clearProfile(): Promise<void>;
}
