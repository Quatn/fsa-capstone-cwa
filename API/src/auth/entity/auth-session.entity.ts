import { BaseAppEntity, IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { UserEntity } from 'src/user/entity/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

export type AuthSessionDto = IBaseAppEntity & {
  userId: string;
  tokenHash: string;
  uuid: string;
  expiresAt: Date;
  revoked: boolean;
  deviceInfo: string;
};

@Entity('auth-sessions')
export class AuthSessionEntity extends BaseAppEntity {
  // COLUMNS

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 255 })
  tokenHash: string;

  @Column({ type: 'uuid' })
  uuid: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'text', nullable: true })
  deviceInfo: string;

  // RELATIONS

  @ManyToOne(() => UserEntity, (user) => user.authSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  // UTILS

  toDto(): AuthSessionDto {
    return {
      id: this.id,
      userId: this.userId,
      tokenHash: this.tokenHash,
      uuid: this.uuid,
      expiresAt: this.expiresAt,
      revoked: this.revoked,
      deviceInfo: this.deviceInfo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
