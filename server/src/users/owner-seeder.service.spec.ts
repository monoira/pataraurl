import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSeederService } from './owner-seeder.service.js';
import { User } from './entities/user.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { AuthService } from '../auth/auth.service.js';

describe('OwnerSeederService', () => {
  let service: OwnerSeederService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let authService: { hashPassword: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn((user) => user),
      save: vi.fn(),
    };
    authService = { hashPassword: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerSeederService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn(
              (key: string) =>
                ({
                  OWNER_EMAIL: 'owner@example.com',
                  OWNER_PASSWORD: 'password123',
                  OWNER_NAME: 'Owner',
                })[key],
            ),
          },
        },
      ],
    }).compile();

    service = module.get<OwnerSeederService>(OwnerSeederService);
  });

  it('does nothing when the owner email already exists', async () => {
    userRepository.findOne.mockResolvedValue({ id: 1, role: Role.ADMIN });

    await service.onModuleInit();

    expect(authService.hashPassword).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('seeds a missing owner and logs without the password', async () => {
    userRepository.findOne.mockResolvedValue(null);
    authService.hashPassword.mockResolvedValue('hashed-password');
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await service.onModuleInit();

    expect(authService.hashPassword).toHaveBeenCalledWith('password123');
    expect(userRepository.create).toHaveBeenCalledWith({
      email: 'owner@example.com',
      name: 'Owner',
      password: 'hashed-password',
      role: Role.OWNER,
    });
    expect(userRepository.save).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('seeded owner user owner@example.com');
    expect(logSpy.mock.calls.join(' ')).not.toContain('password123');

    logSpy.mockRestore();
  });
});
