import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from './user.schema';

/**
 * 10 rounds balances "slow enough to frustrate brute-force" against "fast
 * enough that login doesn't feel sluggish". OWASP's guidance in 2024 was
 * minimum 10 for bcrypt; we can raise later without a migration because
 * bcrypt hashes self-describe their cost factor.
 */
const BCRYPT_ROUNDS = 10;

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Creates a new active user. Caller is responsible for auth / RBAC — this
   * layer only enforces data-level invariants (unique email, hashed
   * password, never stores a plaintext secret anywhere).
   */
  async create(input: CreateUserInput): Promise<UserDocument> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.userModel
      .findOne({ email, deletedAt: null })
      .exec();
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const created = await this.userModel.create({
      email,
      passwordHash,
      name: input.name,
      role: input.role ?? UserRole.AGENT,
    });
    // Re-fetch to apply the `toJSON` transform, strip `passwordHash`, etc.
    return this.findById(String(created._id));
  }

  /**
   * Finds a user by email **including the password hash** for use by the
   * auth layer during login. Never expose the return value to callers
   * outside auth — the hash is otherwise `select: false` for a reason.
   */
  findByEmailForAuth(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim(), deletedAt: null })
      .select('+passwordHash')
      .exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findAllActive(): Promise<UserDocument[]> {
    return this.userModel.find({ deletedAt: null }).exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments({ deletedAt: null }).exec();
  }

  /**
   * Checks a plaintext password against a stored hash. Wrapped here so the
   * auth module never has to touch bcrypt directly; if we swap to argon2
   * or similar, this is the single place to change.
   */
  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
