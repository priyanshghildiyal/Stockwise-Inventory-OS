import { MembershipRole, PrismaClient } from '@prisma/client';
import type { AuthStore, NewSession, NewUser, StoredSession, StoredUser } from './store.js';

const toRole = (role: MembershipRole) => role as StoredUser['role'];

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: NewUser): Promise<StoredUser> {
    const created = await this.prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({ data: { name: input.organizationName } });
      const user = await transaction.user.create({ data: { email: input.email, name: input.name, passwordHash: input.passwordHash } });
      await transaction.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER } });
      return { organization, user };
    });
    return { ...input, id: created.user.id, organizationId: created.organization.id, organizationName: created.organization.name };
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { memberships: { include: { organization: true } } } });
    return user?.memberships[0] ? {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      organizationId: user.memberships[0].organizationId,
      organizationName: user.memberships[0].organization.name,
      role: toRole(user.memberships[0].role),
    } : null;
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { memberships: { include: { organization: true } } } });
    return user?.memberships[0] ? {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      organizationId: user.memberships[0].organizationId,
      organizationName: user.memberships[0].organization.name,
      role: toRole(user.memberships[0].role),
    } : null;
  }

  async createSession(input: NewSession) {
    const session = await this.prisma.session.create({ data: {
      tokenHash: input.tokenHash,
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: new Date(input.expiresAt),
    } });
    return { ...input, id: session.id, expiresAt: session.expiresAt.getTime(), revokedAt: null };
  }

  async findSession(tokenHash: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    return session ? {
      id: session.id,
      tokenHash: session.tokenHash,
      userId: session.userId,
      organizationId: session.organizationId,
      expiresAt: session.expiresAt.getTime(),
      revokedAt: session.revokedAt?.getTime() || null,
    } : null;
  }

  async revokeSession(tokenHash: string) {
    await this.prisma.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
