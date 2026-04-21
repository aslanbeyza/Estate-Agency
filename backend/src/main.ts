import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

/**
 * Parse `FRONTEND_ORIGIN` into an allow-list.
 *
 * We deliberately refuse `*`: financial data (commission splits, agent
 * earnings) must never be reachable from a cross-origin page the user
 * didn't explicitly trust. An unset env var falls back to the local Nuxt
 * dev server so `npm run dev` still works without configuration; anything
 * beyond that must be spelled out.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return ['http://localhost:3000'];
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.includes('*')) {
    throw new Error(
      'FRONTEND_ORIGIN="*" is refused — this API serves financial data and must be origin-locked.',
    );
  }
  return origins;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers: sets sane defaults for CSP, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, etc. We keep helmet's stock
  // config — the API returns JSON only, so the default CSP is safe, and
  // we serve Swagger from the same origin which is already allowed.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN);
  app.enableCors({
    origin: allowedOrigins,
    // Matches what we actually use; narrower than the NestJS default
    // (`*`), which reflected every request method back.
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // `credentials: true` would let the browser attach cookies. We have
    // no session cookies today, so leaving it off is the safer default
    // — flip it on (and drop any `*` origins) the day we add auth.
    credentials: false,
    maxAge: 600,
  });
  Logger.log(`CORS locked to: ${allowedOrigins.join(', ')}`, 'Bootstrap');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Estate Agency API')
    .setDescription(
      'Transaction lifecycle + commission breakdown API for estate agency consultancy.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('agents')
    .addTag('transactions')
    .addTag('health')
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, doc);

  const port = process.env.PORT ?? 3001;
  // Bind to `0.0.0.0` explicitly: on PaaS providers (Render, Fly, etc.)
  // the container has its own internal interface and localhost-only
  // binding silently answers nothing. NestJS's default is already
  // `0.0.0.0` with Express, but stating it makes the intent visible to
  // anyone reading the bootstrap path.
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
  Logger.log(`Swagger docs at /api/docs`, 'Bootstrap');
}

// Only auto-run the bootstrap when this module is executed as the entry
// point (via `nest start`, `node dist/main.js`, etc.). Guarding lets the
// spec file import `parseAllowedOrigins` without spinning up an actual
// Nest app — which would try to connect to MongoDB and leak worker
// processes into the Jest run.
if (require.main === module) {
  void bootstrap();
}
