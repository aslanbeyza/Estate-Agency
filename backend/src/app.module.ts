import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    // Rate limiting. Defaults protect every route; `@Throttle()` overrides
    // tighten individual handlers (see `AuthController.login`). 60 req/min
    // is generous for a back-office UI, tight enough to stop casual
    // scripting.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    UsersModule,
    AuthModule,
    AgentsModule,
    TransactionsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    // Global throttle guard runs on every route regardless of `@Public()`.
    // Declared at the module level so `@Throttle()` decorators work
    // everywhere without per-controller wiring.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
