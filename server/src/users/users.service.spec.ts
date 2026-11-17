import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { User } from './entities/user.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    preload: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let authService: {
    hashPassword: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      preload: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    };

    authService = {
      hashPassword: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('hashes a password when creating a user', async () => {
      userRepository.findOne.mockResolvedValue(null);
      authService.hashPassword.mockResolvedValue('hashed-password');
      userRepository.create.mockReturnValue({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed-password',
      });
      userRepository.save.mockResolvedValue({
        id: 1,
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed-password',
      });

      await expect(
        service.create({
          email: 'alice@example.com',
          name: 'Alice',
          password: 'password123',
        }),
      ).resolves.toEqual({
        id: 1,
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed-password',
      });

      expect(authService.hashPassword).toHaveBeenCalledWith('password123');
      expect(userRepository.create).toHaveBeenCalledWith({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed-password',
      });
    });

    it('rejects duplicate emails without hashing or saving', async () => {
      userRepository.findOne.mockResolvedValue({ id: 1, email: 'alice@example.com' });

      await expect(
        service.create({
          email: 'alice@example.com',
          name: 'Alice',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create({
          email: 'alice@example.com',
          name: 'Alice',
          password: 'password123',
        }),
      ).rejects.toThrow('user with email alice@example.com already exists');

      expect(authService.hashPassword).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('propagates hashing errors from the auth service', async () => {
      userRepository.findOne.mockResolvedValue(null);
      authService.hashPassword.mockRejectedValue(new Error('bcrypt unavailable'));

      await expect(
        service.create({
          email: 'alice@example.com',
          name: 'Alice',
          password: 'password123',
        }),
      ).rejects.toThrow('bcrypt unavailable');

      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies pagination defaults with no role filter', async () => {
      userRepository.find.mockResolvedValue([{ id: 1 }]);

      await expect(service.findAll(new PaginationQueryDto())).resolves.toEqual([{ id: 1 }]);

      expect(userRepository.find).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        order: { name: 'ASC', id: 'ASC' },
        where: undefined,
      });
    });

    it('computes skip and take for a requested page and filters by role', async () => {
      const query = new PaginationQueryDto();
      query.page = 3;
      query.limit = 20;
      query.role = Role.ADMIN;
      userRepository.find.mockResolvedValue([]);

      await service.findAll(query);

      expect(userRepository.find).toHaveBeenCalledWith({
        skip: 40,
        take: 20,
        order: { name: 'ASC', id: 'ASC' },
        where: { role: Role.ADMIN },
      });
    });
  });

  describe('findOne', () => {
    it('returns a user by id', async () => {
      userRepository.findOne.mockResolvedValue({ id: 1, email: 'alice@example.com' });

      await expect(service.findOne(1)).resolves.toMatchObject({ id: 1 });
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(99)).rejects.toThrow('user 99 not found');
    });
  });

  describe('update', () => {
    it('allows the owner to change roles to any enum value', async () => {
      const updatedUser = { id: 2, email: 'bob@example.com', role: Role.ADMIN };
      userRepository.preload.mockResolvedValue(updatedUser);
      userRepository.save.mockResolvedValue(updatedUser);

      await expect(
        service.update(
          2,
          { role: Role.ADMIN },
          { id: 1, role: Role.OWNER, email: 'owner@example.com' },
        ),
      ).resolves.toEqual(updatedUser);

      expect(userRepository.preload).toHaveBeenCalledWith({
        id: 2,
        role: Role.ADMIN,
      });
    });

    it('blocks non-owners from changing roles', async () => {
      await expect(
        service.update(
          2,
          { role: Role.ADMIN },
          { id: 3, role: Role.ADMIN, email: 'admin@example.com' },
        ),
      ).rejects.toThrow('Only the owner can change roles');

      expect(userRepository.preload).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('hashes a new password before saving', async () => {
      const updatedUser = { id: 1, password: 'bcrypt-hash' };
      authService.hashPassword.mockResolvedValue('bcrypt-hash');
      userRepository.preload.mockResolvedValue(updatedUser);
      userRepository.save.mockResolvedValue(updatedUser);

      await service.update(
        1,
        { password: 'new-password' },
        { id: 1, role: Role.MEMBER, email: 'user@example.com' },
      );

      expect(authService.hashPassword).toHaveBeenCalledWith('new-password');
      expect(userRepository.preload).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, password: 'bcrypt-hash' }),
      );
    });

    it('allows members to update their own account', async () => {
      userRepository.preload.mockResolvedValue({ id: 3, name: 'Updated' });
      userRepository.save.mockResolvedValue({ id: 3, name: 'Updated' });

      await expect(
        service.update(
          3,
          { name: 'Updated' },
          { id: 3, role: Role.MEMBER, email: 'member@example.com' },
        ),
      ).resolves.toMatchObject({ name: 'Updated' });

      expect(userRepository.preload).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('blocks members from updating another account', async () => {
      await expect(
        service.update(
          2,
          { name: 'Hijacked' },
          { id: 3, role: Role.MEMBER, email: 'member@example.com' },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(userRepository.preload).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('allows admins to update another account', async () => {
      userRepository.preload.mockResolvedValue({ id: 2, name: 'Updated' });
      userRepository.save.mockResolvedValue({ id: 2, name: 'Updated' });

      await expect(
        service.update(
          2,
          { name: 'Updated' },
          { id: 3, role: Role.ADMIN, email: 'admin@example.com' },
        ),
      ).resolves.toMatchObject({ name: 'Updated' });

      expect(userRepository.preload).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'Updated' }),
      );
    });

    it('throws NotFoundException when the user to update does not exist', async () => {
      userRepository.preload.mockResolvedValue(null);

      await expect(
        service.update(
          99,
          { name: 'Ghost' },
          { id: 1, role: Role.OWNER, email: 'owner@example.com' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing user', async () => {
      const user = { id: 7, email: 'user7@example.com' };
      userRepository.findOne.mockResolvedValue(user);
      userRepository.remove.mockResolvedValue(user);

      await expect(service.remove(7)).resolves.toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
      expect(userRepository.remove).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException and does not delete a missing user', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
      expect(userRepository.remove).not.toHaveBeenCalled();
    });
  });
});
