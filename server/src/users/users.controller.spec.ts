import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { instanceToPlain } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { User } from './entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: {} }],
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
});

function getControllerMethod(methodName: string) {
  const method = Object.getOwnPropertyDescriptor(UsersController.prototype, methodName)?.value;

  if (typeof method !== 'function') {
    throw new Error(`UsersController method ${methodName} was not found`);
  }

  return method;
}
