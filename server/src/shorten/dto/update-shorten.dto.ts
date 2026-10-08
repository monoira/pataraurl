import { PartialType } from '@nestjs/swagger';
import { CreateShortenDto } from './create-shorten.dto.js';

export class UpdateShortenDto extends PartialType(CreateShortenDto) {}
