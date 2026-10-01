import { randomUUID } from 'node:crypto';

import type { Role } from './permissions.js';

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  organizationId: string;
  organizationName: string;
  role: Role;
};

export type StoredSession = {
  id: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  expiresAt: number;
  revokedAt: number | null;
};

export type NewUser = Omit<StoredUser, 'id' | 'organizationId'>;
export type NewSession = Omit<StoredSession, 'id' | 'revokedAt'>;

export interface AuthStore {
  createUser(input: NewUser): Promise<StoredUser>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  createSession(input: NewSession): Promise<StoredSession>;
  findSession(tokenHash: string): Promise<StoredSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
}

export class MemoryAuthStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, StoredSession>();

  async createUser(input: NewUser) {
    const organizationId = randomUUID();
    const user: StoredUser = { ...input, id: randomUUID(), organizationId };
    this.users.set(user.email, user);
    return user;
  }

  async findUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }

  async findUserById(id: string) {
    return [...this.users.values()].find((user) => user.id === id) ?? null;
  }

  async createSession(input: NewSession) {
    const session: StoredSession = { ...input, id: randomUUID(), revokedAt: null };
    this.sessions.set(session.tokenHash, session);
    return session;
  }

  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (session) session.revokedAt = Date.now();
  }
}
