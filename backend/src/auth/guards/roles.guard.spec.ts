import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/user.schema';
import { RolesGuard } from './roles.guard';

const ctxWithUser = (user: { role?: UserRole } | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  it('@Roles tanımsızsa herkesi geçirir', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.AGENT }))).toBe(true);
  });

  it('boş diziyse herkesi geçirir', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.AGENT }))).toBe(true);
  });

  it('required rolü karşılayan kullanıcıyı geçirir', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
    ]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('required rolü karşılamayan kullanıcıya Forbidden atar', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
    ]);
    expect(() =>
      guard.canActivate(ctxWithUser({ role: UserRole.AGENT })),
    ).toThrow(ForbiddenException);
  });

  it('req.user yoksa (bypass hatası) Forbidden atar', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
    ]);
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('birden fazla rolden birini kabul eder (OR semantics)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
      UserRole.AGENT,
    ]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.AGENT }))).toBe(true);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.ADMIN }))).toBe(true);
  });
});
