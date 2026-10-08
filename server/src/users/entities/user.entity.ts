import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum.js';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    unique: true,
  })
  email: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.MEMBER,
  })
  role: Role;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({
    select: false,
  })
  @Exclude()
  password: string;

  @Column('text', {
    nullable: true,
    select: false,
  })
  @Exclude()
  refreshTokenHash?: string | null;

  @Column({
    nullable: true,
    type: 'timestamptz',
    select: false,
  })
  @Exclude()
  refreshTokenExpiresAt?: Date | null;
}
