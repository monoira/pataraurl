import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  REFRESH_COOKIE_OPTIONS,
  REFRESH_TOKEN_MAX_AGE,
} from '../common/constants/auth.constants.js';
import type {
  AuthenticatedRequest,
  RefreshRequest,
} from '../common/types/auth.types.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshJwtAuthGuard } from './guards/refresh-jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(loginUserDto);

    this.setRefreshCookie(res, tokens.refresh_token);

    return {
      access_token: tokens.access_token,
    };
  }

  @Post('refresh')
  @UseGuards(RefreshJwtAuthGuard)
  @HttpCode(200)
  async refresh(
    @Req() req: RefreshRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(
      req.user.id,
      req.cookies.refresh_token,
    );

    this.setRefreshCookie(res, tokens.refresh_token);

    return {
      access_token: tokens.access_token,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeRefreshToken(req.user.id);

    res.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
    return { message: 'Logged out' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }
}
