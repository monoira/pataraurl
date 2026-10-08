import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../common/types/auth.types.js';
import { CreateShortenDto } from './dto/create-shorten.dto.js';
import { UpdateShortenDto } from './dto/update-shorten.dto.js';
import { Shorten } from './entities/shorten.entity.js';

@Injectable()
export class ShortenService {
  constructor(
    @InjectRepository(Shorten)
    private readonly shortenRepository: Repository<Shorten>,
  ) {}

  private generateShortCode(): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async create(createShortenDto: CreateShortenDto, user: AuthenticatedUser) {
    let shortCode = this.generateShortCode();
    while (await this.shortenRepository.findOne({ where: { shortCode } })) {
      shortCode = this.generateShortCode();
    }

    const shorten = this.shortenRepository.create({
      url: createShortenDto.url,
      shortCode,
      userId: user.id,
    });

    const saved = await this.shortenRepository.save(shorten);
    return this.formatResponse(saved);
  }

  async findOriginal(shortCode: string) {
    const shorten = await this.shortenRepository.findOne({
      where: { shortCode },
    });

    if (!shorten) {
      throw new NotFoundException(`short url with code ${shortCode} not found`);
    }

    shorten.accessCount += 1;
    await this.shortenRepository.save(shorten);

    return this.formatResponse(shorten);
  }

  async getOneStats(shortCode: string, user: AuthenticatedUser) {
    const shorten = await this.shortenRepository.findOne({
      where: { shortCode },
    });

    if (!shorten) {
      throw new NotFoundException(`short url with code ${shortCode} not found`);
    }

    if (
      shorten.userId &&
      shorten.userId !== user.id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.OWNER
    ) {
      throw new ForbiddenException(
        'You can only view stats for your own short URLs',
      );
    }

    return {
      ...this.formatResponse(shorten),
      accessCount: shorten.accessCount,
    };
  }

  async getAllStats(user: AuthenticatedUser) {
    const shortens = await this.shortenRepository.find({
      where: { userId: user.id },
    });

    return shortens.map((shorten) => ({
      ...this.formatResponse(shorten),
      accessCount: shorten.accessCount,
    }));
  }

  // only updates URL, not shortCode or anything else
  async update(
    shortCode: string,
    updateShortenDto: UpdateShortenDto,
    user: AuthenticatedUser,
  ) {
    const shorten = await this.shortenRepository.findOne({
      where: { shortCode },
    });

    if (!shorten) {
      throw new NotFoundException(`short url with code ${shortCode} not found`);
    }

    if (
      shorten.userId &&
      shorten.userId !== user.id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.OWNER
    ) {
      throw new ForbiddenException('You can only update your own short URLs');
    }

    if (updateShortenDto.url) {
      shorten.url = updateShortenDto.url;
    }

    const updated = await this.shortenRepository.save(shorten);
    return this.formatResponse(updated);
  }

  async remove(shortCode: string, user: AuthenticatedUser) {
    const shorten = await this.shortenRepository.findOne({
      where: { shortCode },
    });

    if (!shorten) {
      throw new NotFoundException(`short url with code ${shortCode} not found`);
    }

    if (
      shorten.userId &&
      shorten.userId !== user.id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.OWNER
    ) {
      throw new ForbiddenException('You can only delete your own short URLs');
    }

    await this.shortenRepository.remove(shorten);
  }

  private formatResponse(shorten: Shorten) {
    return {
      id: String(shorten.id),
      url: shorten.url,
      shortCode: shorten.shortCode,
      createdAt: shorten.createdAt
        ? shorten.createdAt.toISOString()
        : new Date().toISOString(),
      updatedAt: shorten.updatedAt
        ? shorten.updatedAt.toISOString()
        : new Date().toISOString(),
    };
  }
}
