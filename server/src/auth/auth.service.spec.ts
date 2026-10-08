import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { User } from '../users/entities/user.entity.js';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      update: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: vi.fn(),
            verifyAsync: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns tokens on successful login', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      password: 'hashed-password',
    });

    vi.spyOn(service, 'comparePasswords').mockResolvedValue(true);
    vi.spyOn(service, 'generateAccessToken').mockResolvedValue('access-token');
    vi.spyOn(service, 'generateRefreshToken').mockResolvedValue(
      'refresh-token',
    );
    vi.spyOn(service, 'hashToken').mockResolvedValue('hashed-refresh-token');

    await expect(
      service.login({ email: 'alice@example.com', password: 'password123' }),
    ).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });

    expect(userRepository.update).toHaveBeenCalledWith(1, {
      refreshTokenHash: 'hashed-refresh-token',
      refreshTokenExpiresAt: expect.any(Date),
    });
  });
});
