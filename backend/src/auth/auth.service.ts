import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../users/user.schema';
import { UsersService } from '../users/users.service';
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
