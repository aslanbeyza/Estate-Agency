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

const VERCEL_HOST_SUFFIX = '.vercel.app';

/**
 * Vercel production host is `{project}.vercel.app`; branch previews are
 * `{project}-git-{branch}-{team}.vercel.app`. We derive a stable project
 * slug so one `FRONTEND_ORIGIN` entry (production URL) also authorises
 * preview deployments without pasting every preview URL into Render.
 */
export function vercelProjectSlugFromHostname(hostname: string): string | null {
  if (!hostname.endsWith(VERCEL_HOST_SUFFIX)) return null;
  const withoutSuffix = hostname.slice(0, -VERCEL_HOST_SUFFIX.length);
  if (withoutSuffix.includes('-git-')) {
    return withoutSuffix.split('-git-')[0] ?? null;
  }
  return withoutSuffix || null;
}

export function trustedVercelProjectSlugs(
  allowedOrigins: string[],
): Set<string> {
  const slugs = new Set<string>();
  for (const o of allowedOrigins) {
    try {
      const host = new URL(o).hostname;
      const slug = vercelProjectSlugFromHostname(host);
      if (slug) slugs.add(slug);
    } catch {
      /* ignore malformed URLs in the allow-list */
    }
  }
  return slugs;
}

/** Whether `origin` may call this API from a browser (CORS). */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    const slug = vercelProjectSlugFromHostname(host);
    if (!slug) return false;
    return trustedVercelProjectSlugs(allowedOrigins).has(slug);
  } catch {
    return false;
  }
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
  const vercelSlugs = trustedVercelProjectSlugs(allowedOrigins);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    },
    // Matches what we actually use; narrower than the NestJS default
    // (`*`), which reflected every request method back.
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // `credentials: true` would let the browser attach cookies. We have
    // no session cookies today, so leaving it off is the safer default
    // — flip it on (and drop any `*` origins) the day we add auth.
    credentials: false,
    maxAge: 600,
  });
  Logger.log(
    `CORS allow-list: ${allowedOrigins.join(', ')}` +
      (vercelSlugs.size > 0
        ? `; Vercel previews also allowed for slug(s): ${[...vercelSlugs].join(', ')}`
        : ''),
    'Bootstrap',
  );

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
