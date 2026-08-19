import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH } from 'src/common/constants';
import { AllUserRoles, type UserRole } from 'src/common/dto/UserRoles';
import { BaseAppEntity } from 'src/common/entity/BaseEntity';
import { Column, Entity } from 'typeorm';

@Entity('users')
export class User extends BaseAppEntity {
  @Column({ length: MAX_USERNAME_LENGTH })
  name: string;

  @Column({ length: MAX_PASSWORD_LENGTH })
  passwordHash: string;

  @Column()
  email: string;

  @Column({ enum: AllUserRoles })
  role: UserRole;
}
