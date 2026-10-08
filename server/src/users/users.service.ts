import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../common/types/auth.types.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({
      where: {
        email: createUserDto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        `user with email ${createUserDto.email} already exists`,
      );
    }

    const passwordHash = await this.authService.hashPassword(
      createUserDto.password,
    );

    const user = this.userRepository.create({
      ...createUserDto,
      password: passwordHash,
    });

    return this.userRepository.save(user);
  }

  findAll(paginationQuery: PaginationQueryDto) {
    const { page, limit, role, sortBy, sortOrder } = paginationQuery;
    const skip = limit * (page - 1);

    return this.userRepository.find({
      skip: skip,
      take: limit,
      order: {
        [sortBy]: sortOrder,
        id: 'ASC',
      },
      where: role ? { role } : undefined,
    });
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({
      where: { id: id },
    });

    if (!user) {
      throw new NotFoundException(`user ${id} not found`);
    }

    return user;
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    actingUser?: AuthenticatedUser,
  ) {
    const updateData = { ...updateUserDto };

    // only someone with role OWNER can change roles
    if (updateData.role !== undefined && actingUser?.role !== Role.OWNER) {
      throw new ForbiddenException('Only the owner can change roles');
    }

    // block members from updating accounts other than their own
    if (actingUser?.role === Role.MEMBER && actingUser.id !== id) {
      throw new ForbiddenException('Members can only update themselves');
    }

    // hash password if updated
    // if updated data includes a password, hash it before saving
    if (updateData.password) {
      updateData.password = await this.authService.hashPassword(
        updateData.password,
      );
    }

    // preload the user entity with the updated data
    const user = await this.userRepository.preload({
      id: id,
      ...updateData,
    });

    if (!user) {
      throw new NotFoundException(`user ${id} not found`);
    }

    return this.userRepository.save(user);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    return this.userRepository.remove(user);
  }
}
