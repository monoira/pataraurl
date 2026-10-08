import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { Role } from '../../common/enums/role.enum.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    example: Role.MEMBER,
    enum: Role,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role)
  readonly role?: Role;
}
