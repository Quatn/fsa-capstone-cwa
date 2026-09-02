import { AuthSessionEntity } from 'src/auth/entity/auth-session.entity';
import { MAX_USERNAME_LENGTH } from 'src/common/constants';
import { BaseAppEntity, IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import {
  AllUserRoles,
  type UserRole,
} from 'src/common/lib/types/dto/UserRoles';
import { Column, Entity, OneToMany } from 'typeorm';

export type UserDto = IBaseAppEntity & {
  name: string;
  email: string;
  role: UserRole;
};

@Entity('users')
export class UserEntity extends BaseAppEntity {
  // COLUMNS

  @Column({ length: MAX_USERNAME_LENGTH })
  name: string;

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ length: 254 })
  email: string;

  @Column({ enum: AllUserRoles })
  role: UserRole;

  // RELATIONS

  @OneToMany(() => AuthSessionEntity, (authSession) => authSession.user)
  authSessions: AuthSessionEntity[];

  // UTILS

  toDto(): UserDto {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
