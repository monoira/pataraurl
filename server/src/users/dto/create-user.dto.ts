import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'David',
  })
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({
    example: 'user1@gmail.com',
  })
  @IsEmail()
  readonly email: string;

  @ApiProperty({
    example: 'password123',
  })
  @IsString()
  @MinLength(8)
  readonly password: string;
}
