import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service.js';
import { User } from './entities/user.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    preload: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let authService: {
    hashPassword: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      preload: vi.fn(),
      save: vi.fn(),
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
});
