import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { AuthUser } from '../decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  role: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      // Refuse to boot with a missing/empty secret. Accepting "undefined"
      // would silently produce tokens signed with "" which any attacker
      // could forge. Startup crash > silent insecurity.
      throw new Error('JWT_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Runs on every authenticated request **after** the signature has been
   * verified. We re-fetch the user so a deactivated account (`deletedAt !=
   * null`) cannot continue to use an otherwise-valid token. This trades a
   * cheap lookup per request for the guarantee that access revocation is
   * immediate rather than "whenever the JWT expires".
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User no longer active');
    }
    return {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }
}
