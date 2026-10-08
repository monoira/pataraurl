import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_MAX_AGE,
} from '../common/constants/auth.constants.js';
import { Role } from '../common/enums/role.enum.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import { User } from '../users/entities/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  generateAccessToken(user: { id: string; email: string; role: Role }) {
    return this.jwtService.signAsync(
      { ...user, type: 'access' },
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );
  }

  generateRefreshToken(user: { id: string; email: string; role: Role }) {
    return this.jwtService.signAsync(
      { ...user, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );
  }

  hashPassword(password: string) {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  comparePasswords(password: string, passwordHash: string) {
    return bcrypt.compare(password, passwordHash);
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  compareTokens(token: string, tokenHash: string) {
    const incomingHash = Buffer.from(
      createHash('sha256').update(token).digest('hex'),
    );
    const storedHash = Buffer.from(tokenHash);

    if (incomingHash.length !== storedHash.length) {
      return false;
    }

    return timingSafeEqual(incomingHash, storedHash);
  }

  private async issueTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const accessToken = await this.generateAccessToken({
      id: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    const refreshToken = await this.generateRefreshToken({
      id: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    const refreshTokenHash = this.hashToken(refreshToken);

    await this.userRepository.update(user.id, {
      refreshTokenHash,
      refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async login(loginUserDto: LoginUserDto) {
    const user = await this.userRepository.findOne({
      where: {
        email: loginUserDto.email,
      },
      select: {
        id: true,
        email: true,
        role: true,
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValidPassword = await this.comparePasswords(
      loginUserDto.password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async refresh(userId: number, refreshToken: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        refreshTokenHash: true,
        refreshTokenExpiresAt: true,
      },
    });

    if (!user || !user.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.refreshTokenExpiresAt <= new Date()) {
      await this.revokeRefreshToken(user.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const isValidRefreshToken = this.compareTokens(
      refreshToken,
      user.refreshTokenHash,
    );

    if (!isValidRefreshToken) {
      await this.revokeRefreshToken(user.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async revokeRefreshToken(userId: number) {
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });
  }
}
