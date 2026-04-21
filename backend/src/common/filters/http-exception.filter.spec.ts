import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { AllExceptionsFilter } from './http-exception.filter';

/**
 * We drive the filter through a minimal fake `ArgumentsHost` and assert on
 * what lands in `response.status().json(...)`. Keeping the test surface
 * tight to the response envelope is on purpose: whenever a new Mongo /
 * Nest exception needs a translation, the assertion list here documents
 * the contract.
 */
function invoke(
  filter: AllExceptionsFilter,
  exception: unknown,
  url = '/things',
  method = 'POST',
) {
  const statusCalls: number[] = [];
  const jsonCalls: unknown[] = [];
  const response = {
    status: (code: number) => {
      statusCalls.push(code);
      return response;
    },
    json: (body: unknown) => {
      jsonCalls.push(body);
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return {
    status: statusCalls[0],
    body: jsonCalls[0] as Record<string, unknown>,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Silence expected logger output — a pile of warnings muddies the
    // Jest console and we already assert on the response body.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserves HttpException status and message', () => {
    const { status, body } = invoke(
      filter,
      new BadRequestException(['totalServiceFee must be an integer (kuruş)']),
    );
    expect(status).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([
      'totalServiceFee must be an integer (kuruş)',
    ]);
    expect(body).toHaveProperty('timestamp');
    expect(body.path).toBe('/things');
  });

  it('translates MongoServerError 11000 to 409 without leaking the duplicate value', () => {
    const err = Object.create(MongoServerError.prototype) as MongoServerError;
    Object.assign(err, {
      code: 11000,
      keyPattern: { email: 1 },
      keyValue: { email: 'ayse@a.com' },
      message: 'E11000 duplicate key error collection: ...',
    });

    const { status, body } = invoke(filter, err);
    expect(status).toBe(409);
    expect(body.error).toBe('DuplicateKey');
    expect(body.message).toMatch(/same email/);
    expect(JSON.stringify(body)).not.toContain('ayse@a.com');
  });

  it('translates Mongoose ValidationError to 400 with per-field messages', () => {
    const err = new MongooseError.ValidationError();
    err.errors = {
      totalServiceFee: {
        message: 'totalServiceFee must be an integer (kuruş)',
      } as MongooseError.ValidatorError,
      propertyAddress: {
        message: 'propertyAddress is required',
      } as MongooseError.ValidatorError,
    };

    const { status, body } = invoke(filter, err);
    expect(status).toBe(400);
    expect(body.error).toBe('ValidationError');
    expect(body.message).toEqual(
      expect.arrayContaining([
        'totalServiceFee must be an integer (kuruş)',
        'propertyAddress is required',
      ]),
    );
  });

  it('translates Mongoose CastError (bad ObjectId) to 400', () => {
    const err = new MongooseError.CastError('ObjectId', 'not-an-oid', 'id');
    const { status, body } = invoke(filter, err, '/agents/not-an-oid', 'GET');
    expect(status).toBe(400);
    expect(body.error).toBe('CastError');
    expect(body.message).toMatch(/Invalid value for id/);
  });

  it('translates Mongoose VersionError to 409 (safety net for missed service-layer catches)', () => {
    const err = new MongooseError.VersionError(
      { _doc: { _id: 'tx1' } } as never,
      1,
      ['stage'],
    );
    const { status, body } = invoke(filter, err);
    expect(status).toBe(409);
    expect(body.error).toBe('VersionError');
  });

  it('translates transient Mongo network errors to 503 (retryable, not 500)', () => {
    const err = new Error('connection timed out');
    err.name = 'MongoNetworkError';
    const { status, body } = invoke(filter, err);
    expect(status).toBe(503);
    expect(body.error).toBe('MongoNetworkError');
    expect(body.message).toMatch(/temporarily unavailable/i);
  });

  it('falls back to 500 with a sanitised message for unknown errors', () => {
    const err = new Error('ENOMEM: out of memory mapping file');
    const { status, body } = invoke(filter, err);
    expect(status).toBe(500);
    expect(body.error).toBe('Error');
    // Raw error text must NOT reach the client — we log it server-side.
    expect(body.message).toBe('Internal server error');
  });

  it('HttpException subclasses still carry their original codes (regression guard)', () => {
    const { status } = invoke(filter, new ConflictException('already there'));
    expect(status).toBe(409);
  });
});
