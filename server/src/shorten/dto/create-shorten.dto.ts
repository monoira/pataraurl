import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateShortenDto {
  @ApiProperty({
    example: 'https://www.example.com/some/long/url',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  readonly url: string;
}
