import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../config.js';
import type { AuthStore, StoredUser } from './store.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (user: StoredUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  organizationId: user.organizationId,
  organization: user.organizationName,
  role: user.role,
});

export class AuthService {
  constructor(private readonly store: AuthStore) {}

  async register(input: { name: string; email: string; password: string; organizationName: string }) {
    if (await this.store.findUserByEmail(input.email)) {
      const error = new Error('An account with this email already exists.');
      error.name = 'ConflictError';
      throw error;
    }
    const user = await this.store.createUser({
      name: input.name,
      email: input.email,
      passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
      organizationName: input.organizationName,
      role: 'OWNER',
    });
    return { user: publicUser(user), ...(await this.issueSession(user)) };
  }

  async login(email: string, password: string) {
    const user = await this.store.findUserByEmail(email);
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      const error = new Error('Email or password is incorrect.');
      error.name = 'AuthenticationError';
      throw error;
    }
    return { user: publicUser(user), ...(await this.issueSession(user)) };
  }

  async authenticate(token: string) {
    const session = await this.store.findSession(hashToken(token));
    if (!session || session.revokedAt || session.expiresAt <= Date.now()) return null;
    const user = await this.store.findUserById(session.userId);
    return user ? { user: publicUser(user), session } : null;
  }

  async logout(token: string) {
    await this.store.revokeSession(hashToken(token));
  }

  private async issueSession(user: StoredUser) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000;
    await this.store.createSession({ tokenHash: hashToken(token), userId: user.id, organizationId: user.organizationId, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }
}
