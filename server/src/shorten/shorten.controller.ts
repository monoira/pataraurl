import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../common/types/auth.types.js';
import { CreateShortenDto } from './dto/create-shorten.dto.js';
import { UpdateShortenDto } from './dto/update-shorten.dto.js';
import { ShortenService } from './shorten.service.js';

@Controller('shorten')
export class ShortenController {
  constructor(private readonly shortenService: ShortenService) {}

  @UseGuards(JwtAuthGuard)
  @Get('all-stats')
  getAllStats(@Req() req: AuthenticatedRequest) {
    return this.shortenService.getAllStats(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createShortenDto: CreateShortenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shortenService.create(createShortenDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':shortCode/stats')
  @ApiParam({ name: 'shortCode', type: 'string', example: 'abc123' })
  getStats(
    @Param('shortCode') shortCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shortenService.getOneStats(shortCode, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':shortCode')
  @ApiParam({ name: 'shortCode', type: 'string', example: 'abc123' })
  update(
    @Param('shortCode') shortCode: string,
    @Body() updateShortenDto: UpdateShortenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shortenService.update(shortCode, updateShortenDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':shortCode')
  @HttpCode(204)
  @ApiParam({ name: 'shortCode', type: 'string', example: 'abc123' })
  remove(
    @Param('shortCode') shortCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shortenService.remove(shortCode, req.user);
  }

  @Get(':shortCode')
  @ApiParam({ name: 'shortCode', type: 'string', example: 'abc123' })
  findOne(@Param('shortCode') shortCode: string) {
    return this.shortenService.findOriginal(shortCode);
  }
}
