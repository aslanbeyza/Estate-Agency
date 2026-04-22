import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { User, UserRole, UserSchema } from '../src/users/user.schema';

const BCRYPT_ROUNDS = 10;

/** Default back-office admin; override with SEED_ADMIN_* env vars if needed. */
const SEED_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@gmail.com')
  .toLowerCase()
  .trim();
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'password123';
const SEED_NAME = process.env.SEED_ADMIN_NAME ?? 'Admin';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required (load .env or export it)');
  }

  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);

  const existing = await UserModel.findOne({
    email: SEED_EMAIL,
    deletedAt: null,
  }).exec();
  if (existing) {
    console.log(`Seed skipped: active user already exists for ${SEED_EMAIL}`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  await UserModel.create({
    email: SEED_EMAIL,
    passwordHash,
    name: SEED_NAME,
    role: UserRole.ADMIN,
    deletedAt: null,
  });
  console.log(`Created admin user: ${SEED_EMAIL}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
