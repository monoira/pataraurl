import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { instanceToPlain } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthenticatedRequest } from '../common/types/auth.types.js';
import { User } from './entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

function makeRequest(): AuthenticatedRequest {
  const mock: unknown = {
    user: { id: 1, email: 'user@example.com', role: Role.MEMBER },
  };

  if (!isAuthenticatedRequest(mock)) {
    throw new Error('request mock is not an AuthenticatedRequest');
  }

  return mock;
}

function isAuthenticatedRequest(value: unknown): value is AuthenticatedRequest {
  return typeof value === 'object' && value !== null && 'user' in value;
}

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;

  const request: AuthenticatedRequest = makeRequest();

  beforeEach(async () => {
    usersService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect authenticated endpoints and leave user creation public', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('me'))).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('findAll'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('findOne'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('update'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('remove'))).toContain(
      JwtAuthGuard,
    );

    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('me'))).not.toContain(
      RolesGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('findAll'))).toContain(
      RolesGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('update'))).toContain(
      RolesGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('remove'))).toContain(
      RolesGuard,
    );

    expect(Reflect.getMetadata('roles', getControllerMethod('update'))).toContain(Role.MEMBER);
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('create'))).toBeUndefined();
  });

  it('should exclude the password hash from serialized user output', () => {
    const user = new User();
    user.id = 1;
    user.name = 'David';
    user.email = 'user1@gmail.com';
    user.password = 'hashed-secret';

    const serialized = instanceToPlain(user);

    expect(serialized).not.toHaveProperty('password');
  });

  it('delegates creation with the dto', async () => {
    const dto = { name: 'Alice', email: 'alice@example.com', password: 'password123' };
    usersService.create.mockResolvedValue({ id: 1, ...dto });

    await expect(controller.create(dto)).resolves.toMatchObject({ id: 1 });
    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it('propagates creation errors from the service', async () => {
    usersService.create.mockRejectedValue(new ForbiddenException('duplicate email'));

    await expect(
      controller.create({ name: 'Alice', email: 'alice@example.com', password: 'password123' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns the authenticated user for the me endpoint', async () => {
    usersService.findOne.mockResolvedValue({ id: 1, email: 'user@example.com' });

    await expect(controller.me(request)).resolves.toMatchObject({ id: 1 });
    expect(usersService.findOne).toHaveBeenCalledWith(1);
  });

  it('propagates errors from the me endpoint', async () => {
    usersService.findOne.mockRejectedValue(new NotFoundException('user 1 not found'));

    await expect(controller.me(request)).rejects.toThrow(NotFoundException);
  });

  it('delegates listing with the pagination query', async () => {
    const query = new PaginationQueryDto();
    query.page = 2;
    usersService.findAll.mockResolvedValue([{ id: 1 }]);

    await expect(controller.findAll(query)).resolves.toEqual([{ id: 1 }]);
    expect(usersService.findAll).toHaveBeenCalledWith(query);
  });

  it('delegates find-one with the route id', async () => {
    usersService.findOne.mockResolvedValue({ id: 7 });

    await expect(controller.findOne(7)).resolves.toMatchObject({ id: 7 });
    expect(usersService.findOne).toHaveBeenCalledWith(7);
  });

  it('propagates find-one errors from the service', async () => {
    usersService.findOne.mockRejectedValue(new NotFoundException('user 7 not found'));

    await expect(controller.findOne(7)).rejects.toThrow(NotFoundException);
  });

  it('delegates updates with the id, dto and authenticated user', async () => {
    const dto = { name: 'Updated' };
    usersService.update.mockResolvedValue({ id: 1, name: 'Updated' });

    await expect(controller.update(1, dto, request)).resolves.toMatchObject({ name: 'Updated' });
    expect(usersService.update).toHaveBeenCalledWith(1, dto, request.user);
  });

  it('propagates update errors from the service', async () => {
    usersService.update.mockRejectedValue(new ForbiddenException('Only the owner can change roles'));

    await expect(controller.update(1, { role: Role.ADMIN }, request)).rejects.toThrow(
      'Only the owner can change roles',
    );
  });

  it('delegates removal with the route id', async () => {
    usersService.remove.mockResolvedValue({ id: 7 });

    await expect(controller.remove(7)).resolves.toMatchObject({ id: 7 });
    expect(usersService.remove).toHaveBeenCalledWith(7);
  });

  it('propagates removal errors from the service', async () => {
    usersService.remove.mockRejectedValue(new NotFoundException('user 7 not found'));

    await expect(controller.remove(7)).rejects.toThrow(NotFoundException);
  });
});

function getControllerMethod(methodName: string) {
  const method = Object.getOwnPropertyDescriptor(UsersController.prototype, methodName)?.value;

  if (typeof method !== 'function') {
    throw new Error(`UsersController method ${methodName} was not found`);
  }

  return method;
}
