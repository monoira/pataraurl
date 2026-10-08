import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Shorten } from './entities/shorten.entity.js';
import { ShortenController } from './shorten.controller.js';
import { ShortenService } from './shorten.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Shorten]), AuthModule],
  controllers: [ShortenController],
  providers: [ShortenService],
})
export class ShortenModule {}
