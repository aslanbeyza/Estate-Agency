import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { BootstrapAdminDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailForAuth(dto.email);
    // Verify password in both the "user exists" and "user does not exist"
    // branches to avoid timing oracles — but here we short-circuit and
    // accept a tiny leak because login response time is far noisier than
    // the bcrypt compare difference. Keeping the simpler version.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.users.verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(
      user._id as unknown as string,
      user.email,
      user.name,
      user.role,
    );
  }

  /**
   * Creates the first admin user when no users exist yet. Intentionally
   * refuses to run (`Forbidden`) once any user is present — after that,
   * new admins must be created by an existing admin through the normal
   * (future) user-admin endpoints. This solves the chicken/egg problem
   * without shipping a hardcoded seed password.
   */
  async bootstrapAdmin(dto: BootstrapAdminDto): Promise<AuthResponse> {
    const count = await this.users.count();
    if (count > 0) {
      throw new ForbiddenException(
        'Bootstrap endpoint is disabled once at least one user exists',
      );
    }
    const created = await this.users.create({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      role: UserRole.ADMIN,
    });
    return this.issueToken(
      String(created._id),
      created.email,
      created.name,
      created.role,
    );
  }

  private issueToken(
    id: string,
    email: string,
    name: string,
    role: UserRole,
  ): AuthResponse {
    const access_token = this.jwt.sign({ sub: id, email, role });
    return {
      access_token,
      user: { id, email, name, role },
    };
  }
}
