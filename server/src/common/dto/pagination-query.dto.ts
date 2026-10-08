import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '../enums/role.enum.js';

/** sortable fields */
export enum SortBy {
  Name = 'name',
  Email = 'email',
  Role = 'role',
  CreatedAt = 'createdAt',
  UpdatedAt = 'updatedAt',
}

/** sort order directions */
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * pagination query dto
 * @property {number} page - page user is on - used for skip calculation
 * @property {number} limit - number of items to return
 * @property {Role} role - filter by user role
 * @property {SortBy} sortBy - field to sort by
 * @property {SortOrder} sortOrder - sort order direction
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy: SortBy = SortBy.Name;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}
