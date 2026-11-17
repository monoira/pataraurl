import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from '../common/constants/auth.constants.js';
import { Role } from '../common/enums/role.enum.js';
import { AuthService } from './auth.service.js';
import { User } from '../users/entities/user.entity.js';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    verifyAsync: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      update: vi.fn(),
    };

    jwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn(),
    };

    vi.mocked(bcrypt.hash).mockImplementation(async () => 'hashed-password');
    vi.mocked(bcrypt.compare).mockImplementation(async () => true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    vi.spyOn(service, 'generateRefreshToken').mockResolvedValue('refresh-token');
    vi.spyOn(service, 'hashToken').mockReturnValue('hashed-refresh-token');

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

  it('issues access and refresh tokens and persists the refresh token hash', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      email: 'alice@example.com',
      role: Role.MEMBER,
      password: 'stored-hash',
    });
    userRepository.update.mockResolvedValue({ affected: 1 });
    jwtService.signAsync.mockResolvedValueOnce('signed-access').mockResolvedValueOnce('signed-refresh');

    await expect(
      service.login({ email: 'alice@example.com', password: 'password123' }),
    ).resolves.toEqual({
      access_token: 'signed-access',
      refresh_token: 'signed-refresh',
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'stored-hash');
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { id: '7', email: 'alice@example.com', role: Role.MEMBER, type: 'access' },
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      { id: '7', email: 'alice@example.com', role: Role.MEMBER, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );
    expect(userRepository.update).toHaveBeenCalledWith(7, {
      refreshTokenHash: service.hashToken('signed-refresh'),
      refreshTokenExpiresAt: expect.any(Date),
    });
  });

  it('rejects login when the email is unknown', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.login({ email: 'nobody@example.com', password: 'password123' })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.login({ email: 'nobody@example.com', password: 'password123' })).rejects.toThrow(
      'Invalid email or password',
    );

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('rejects login when the password does not match', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      email: 'alice@example.com',
      role: Role.MEMBER,
      password: 'stored-hash',
    });
    vi.mocked(bcrypt.compare).mockImplementation(async () => false);

    await expect(service.login({ email: 'alice@example.com', password: 'wrong-password' })).rejects.toThrow(
      'Invalid email or password',
    );

    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', 'stored-hash');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('propagates unexpected errors from password comparison', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      email: 'alice@example.com',
      role: Role.MEMBER,
      password: 'stored-hash',
    });
    vi.mocked(bcrypt.compare).mockRejectedValue(new Error('bcrypt unavailable'));

    await expect(service.login({ email: 'alice@example.com', password: 'password123' })).rejects.toThrow(
      'bcrypt unavailable',
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('propagates repository errors while persisting the refresh token', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      email: 'alice@example.com',
      role: Role.MEMBER,
      password: 'stored-hash',
    });
    userRepository.update.mockRejectedValue(new Error('database offline'));
    jwtService.signAsync.mockResolvedValue('signed-token');

    await expect(service.login({ email: 'alice@example.com', password: 'password123' })).rejects.toThrow(
      'database offline',
    );
  });

  it('hashes passwords with bcrypt using ten salt rounds', async () => {
    vi.mocked(bcrypt.hash).mockImplementation(async () => 'bcrypt-hash');

    await expect(service.hashPassword('password123')).resolves.toBe('bcrypt-hash');
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
  });

  it('compares passwords through bcrypt', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(async () => false);

    await expect(service.comparePasswords('password123', 'stored-hash')).resolves.toBe(false);
    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'stored-hash');
  });

  it('generates a stable sha256 token hash', () => {
    const first = service.hashToken('token-value');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashToken('token-value')).toBe(first);
    expect(service.hashToken('other-value')).not.toBe(first);
  });

  it('compares tokens safely for matching, mismatching and malformed hashes', () => {
    const tokenHash = service.hashToken('token-value');

    expect(service.compareTokens('token-value', tokenHash)).toBe(true);
    expect(service.compareTokens('other-value', tokenHash)).toBe(false);
    expect(service.compareTokens('token-value', 'too-short')).toBe(false);
  });

  it('generates access and refresh tokens with the expected payloads', async () => {
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    await expect(
      service.generateAccessToken({ id: '1', email: 'alice@example.com', role: Role.ADMIN }),
    ).resolves.toBe('access-token');
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { id: '1', email: 'alice@example.com', role: Role.ADMIN, type: 'access' },
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );

    await expect(
      service.generateRefreshToken({ id: '1', email: 'alice@example.com', role: Role.ADMIN }),
    ).resolves.toBe('refresh-token');
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      { id: '1', email: 'alice@example.com', role: Role.ADMIN, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );
  });

  describe('refresh', () => {
    const refreshToken = 'incoming-refresh-token';
    const validUser = {
      id: 3,
      email: 'alice@example.com',
      role: Role.MEMBER,
      refreshTokenHash: 'stored-refresh-hash',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    };

    it('rejects refresh when the user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh(3, refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('rejects refresh when the stored hash is missing', async () => {
      userRepository.findOne.mockResolvedValue({
        ...validUser,
        refreshTokenHash: null,
      });

      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('rejects refresh when the stored expiry is missing', async () => {
      userRepository.findOne.mockResolvedValue({
        ...validUser,
        refreshTokenExpiresAt: null,
      });

      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('revokes and rejects an expired refresh token', async () => {
      userRepository.findOne.mockResolvedValue({
        ...validUser,
        refreshTokenExpiresAt: new Date(Date.now() - 60_000),
      });
      const revokeSpy = vi.spyOn(service, 'revokeRefreshToken').mockResolvedValue(undefined);

      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Refresh token expired');
      expect(revokeSpy).toHaveBeenCalledWith(3);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('revokes and rejects a refresh token that does not match the stored hash', async () => {
      userRepository.findOne.mockResolvedValue(validUser);
      const revokeSpy = vi.spyOn(service, 'revokeRefreshToken').mockResolvedValue(undefined);

      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(revokeSpy).toHaveBeenCalledWith(3);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('revokes and rejects a malformed refresh token', async () => {
      userRepository.findOne.mockResolvedValue({
        ...validUser,
        refreshTokenHash: 'not-a-64-char-hash',
      });
      const revokeSpy = vi.spyOn(service, 'revokeRefreshToken').mockResolvedValue(undefined);

      await expect(service.refresh(3, refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(revokeSpy).toHaveBeenCalledWith(3);
    });

    it('rotates tokens when the refresh token is valid', async () => {
      const storedHash = service.hashToken(refreshToken);
      userRepository.findOne.mockResolvedValue({
        ...validUser,
        refreshTokenHash: storedHash,
      });
      userRepository.update.mockResolvedValue({ affected: 1 });
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      await expect(service.refresh(3, refreshToken)).resolves.toEqual({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });

      expect(userRepository.update).toHaveBeenCalledWith(3, {
        refreshTokenHash: service.hashToken('new-refresh-token'),
        refreshTokenExpiresAt: expect.any(Date),
      });
    });
  });

  it('clears the stored refresh token on revoke', async () => {
    userRepository.update.mockResolvedValue({ affected: 1 });

    await expect(service.revokeRefreshToken(9)).resolves.toBeUndefined();
    expect(userRepository.update).toHaveBeenCalledWith(9, {
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });
  });
});
