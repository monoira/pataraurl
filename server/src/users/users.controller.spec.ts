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

  beforeEach(() => {
    controller = new UsersController({} as UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect authenticated endpoints and leave user creation public', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.me),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAll),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findOne),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.update),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.remove),
    ).toContain(JwtAuthGuard);

    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.me),
    ).not.toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.findAll),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.update),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.remove),
    ).toContain(RolesGuard);

    expect(
      Reflect.getMetadata('roles', UsersController.prototype.update),
    ).toContain(Role.MEMBER);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.create),
    ).toBeUndefined();
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
