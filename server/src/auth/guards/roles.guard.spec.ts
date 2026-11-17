import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../common/enums/role.enum.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

const handler = () => undefined;

class TestController {
  handle() {
    return handler;
  }
}

function isExecutionContext(value: unknown): value is ExecutionContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getHandler' in value &&
    'getClass' in value &&
    'switchToHttp' in value
  );
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let request: { user?: { role?: Role } };
  let switchToHttp: ReturnType<typeof vi.fn>;
  let context: ExecutionContext;

  beforeEach(async () => {
    reflector = { getAllAndOverride: vi.fn() };
    request = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);

    switchToHttp = vi.fn(() => ({
      getRequest: () => request,
    }));

    const mock: unknown = {
      getHandler: vi.fn(() => handler),
      getClass: vi.fn(() => TestController),
      switchToHttp,
    };

    if (!isExecutionContext(mock)) {
      throw new Error('context mock is not an ExecutionContext');
    }

    context = mock;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows access when no roles metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
    expect(switchToHttp).not.toHaveBeenCalled();
  });

  it('allows access when the roles metadata is an empty list', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(context)).toBe(true);
    expect(switchToHttp).not.toHaveBeenCalled();
  });

  it('queries the reflector with the roles key, handler and class', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    request.user = { role: Role.ADMIN };

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [handler, TestController]);
    expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
  });

  it('allows a user whose role is one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.OWNER]);
    request.user = { role: Role.OWNER };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user whose role is a later entry in a multi-role list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.OWNER, Role.ADMIN, Role.MEMBER]);
    request.user = { role: Role.MEMBER };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user whose role is not in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.OWNER]);
    request.user = { role: Role.MEMBER };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Access denied. Required role: ADMIN or OWNER',
    );
  });

  it('rejects a request without an authenticated user', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Missing user role');
  });

  it('rejects an authenticated user without a role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.MEMBER]);
    request.user = {};

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Missing user role');
  });
});
