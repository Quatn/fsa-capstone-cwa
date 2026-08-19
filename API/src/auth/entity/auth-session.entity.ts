import { BaseAppEntity } from 'src/common/entity/BaseEntity';
import { Column, Entity } from 'typeorm';

@Entity('auth-sessions')
export class AuthSession extends BaseAppEntity {
  @Column()
  userId: string;

  @Column({ length: 200 })
  tokenHash: string;

  @Column({ length: 64 })
  uuid: string;

  @Column()
  expiresAt: Date;

  @Column()
  revoked: boolean;

  @Column()
  deviceInfo: string;
}
