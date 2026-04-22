import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const baseUser = {
    _id: 'u1',
    email: 'admin@estate.com',
    name: 'Admin',
    role: UserRole.ADMIN,
    passwordHash: 'hash',
    deletedAt: null,
  };

  const jwt = {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
  } as unknown as JwtService;

  const buildUsers = (over: Partial<UsersService> = {}) =>
    ({
      findByEmailForAuth: jest.fn(),
      verifyPassword: jest.fn(),
      create: jest.fn(),
      ...over,
    }) as unknown as UsersService;

  describe('login', () => {
    it('doğru şifreyle token üretir ve hash sızdırmaz', async () => {
      const users = buildUsers({
        findByEmailForAuth: jest.fn().mockResolvedValue(baseUser),
        verifyPassword: jest.fn().mockResolvedValue(true),
      });
      const service = new AuthService(users, jwt);

      const res = await service.login({
        email: 'admin@estate.com',
        password: 'correct-horse',
      });

      expect(res.access_token).toBe('signed.jwt.token');
      expect(res.user).toEqual({
        id: 'u1',
        email: baseUser.email,
        name: baseUser.name,
        role: UserRole.ADMIN,
      });
      // Guard against accidental hash exposure over the wire.
      expect(JSON.stringify(res)).not.toContain('hash');
    });

    it('bilinmeyen email Unauthorized atar', async () => {
      const users = buildUsers({
        findByEmailForAuth: jest.fn().mockResolvedValue(null),
      });
      const service = new AuthService(users, jwt);

      await expect(
        service.login({ email: 'ghost@x.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('yanlış şifre Unauthorized atar', async () => {
      const users = buildUsers({
        findByEmailForAuth: jest.fn().mockResolvedValue(baseUser),
        verifyPassword: jest.fn().mockResolvedValue(false),
      });
      const service = new AuthService(users, jwt);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
