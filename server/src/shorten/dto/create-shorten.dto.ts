import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateShortenDto {
  @ApiProperty({
    example: 'https://www.example.com/some/long/url',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  readonly url: string;

  @ApiPropertyOptional({ example: 'My favorite site', nullable: true })
  @IsOptional()
  @IsString()
  readonly nickname?: string | null;
}
