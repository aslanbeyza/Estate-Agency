import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';

interface ErrorBody {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

/**
 * Shape used by every translated error. Keeping the filter's exit point a
 * single `respond(...)` call guarantees every branch produces the same
 * envelope — the frontend relies on `{ statusCode, message }` being present
 * regardless of what blew up under the hood.
 */
interface Translated {
  status: number;
  message: string | string[];
  error?: string;
}

/**
 * Duplicate-key (MongoServerError code 11000). We return the field path
 * that triggered the collision — useful for form highlighting — but
 * deliberately **not** the value, because `keyValue` can carry user PII
 * (e.g. an existing email address).
 */
function translateDuplicateKey(err: MongoServerError): Translated {
  const pattern = (err.keyPattern ?? err.keyValue ?? {}) as Record<
    string,
    unknown
  >;
  const fields = Object.keys(pattern);
  const label = fields.length ? fields.join(', ') : 'field';
  return {
    status: HttpStatus.CONFLICT,
    message: `A record with the same ${label} already exists`,
    error: 'DuplicateKey',
  };
}

/**
 * Mongoose validator failures (our `Number.isInteger` on kuruş amounts,
 * `min: 0`, required props, etc.) map to 400 with the class-validator-style
 * `message: string[]` shape the frontend already handles.
 */
function translateMongooseValidation(
  err: MongooseError.ValidationError,
): Translated {
  const messages = Object.values(err.errors).map((e) => e.message);
  return {
    status: HttpStatus.BAD_REQUEST,
    message: messages.length ? messages : [err.message],
    error: 'ValidationError',
  };
}

/**
 * `CastError` almost always means a client handed us a malformed
 * `ObjectId` in the URL or body. That's squarely a 400, not a 500 — the
 * server is fine, the request is not.
 */
function translateCastError(err: MongooseError.CastError): Translated {
  return {
    status: HttpStatus.BAD_REQUEST,
    message: `Invalid value for ${err.path}`,
    error: 'CastError',
  };
}

/**
 * Transient infrastructure failures (Atlas flake, TCP reset, primary
 * election) are not the client's fault and should not scream "500
 * Internal Server Error" in the logs. 503 tells the UI / load balancer
 * it's safe to retry.
 */
function translateTransient(error: string): Translated {
  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Database temporarily unavailable, please retry',
    error,
  };
}

function isTransientMongoError(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  // The Node driver exposes these as distinct classes, but we check by
  // name to avoid importing internals that change between driver majors.
  return [
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoTimeoutError',
  ].includes(exception.name);
}

function translate(exception: unknown): Translated {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    if (typeof res === 'string') {
      return { status, message: res };
    }
    const r = res as { message?: string | string[]; error?: string };
    return {
      status,
      message: r.message ?? exception.message,
      error: r.error,
    };
  }

  // Mongoose's optimistic concurrency error. Services *should* already
  // catch this (see TransactionsService.updateStage) but the filter is a
  // safety net so a missed `try/catch` doesn't degrade to a generic 500.
  if (exception instanceof MongooseError.VersionError) {
    return {
      status: HttpStatus.CONFLICT,
      message:
        'The record was modified by another request. Please refresh and retry.',
      error: 'VersionError',
    };
  }

  if (exception instanceof MongooseError.ValidationError) {
    return translateMongooseValidation(exception);
  }

  if (exception instanceof MongooseError.CastError) {
    return translateCastError(exception);
  }

  if (exception instanceof MongoServerError && exception.code === 11000) {
    return translateDuplicateKey(exception);
  }

  if (isTransientMongoError(exception)) {
    return translateTransient((exception as Error).name);
  }

  if (exception instanceof Error) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: exception.name,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = translate(exception);

    const body: ErrorBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
    };

    // 5xx stays `error` level (we want to know), 4xx drops to `warn`
    // (client misuse, not our problem). Raw driver messages are logged
    // server-side only — they never cross the wire.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${status} ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(body);
  }
}
