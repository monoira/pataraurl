import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import { Role } from '../common/enums/role.enum.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class OwnerSeederService implements OnModuleInit {
  private readonly logger = new Logger(OwnerSeederService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.configService.getOrThrow<string>('OWNER_EMAIL');
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      return;
    }

    const password = this.configService.getOrThrow<string>('OWNER_PASSWORD');
    const name = this.configService.getOrThrow<string>('OWNER_NAME');
    const passwordHash = await this.authService.hashPassword(password);

    await this.userRepository.save(
      this.userRepository.create({
        email,
        name,
        password: passwordHash,
        role: Role.OWNER,
      }),
    );

    this.logger.log(`seeded owner user ${email}`);
  }
}
