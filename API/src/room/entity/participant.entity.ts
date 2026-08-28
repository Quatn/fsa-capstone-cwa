import { BaseAppEntity, IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { ChatMessageEntity } from './chat-message.entity';
import { UserEntity } from 'src/user/entity/user.entity';

export type ParticipantDto = IBaseAppEntity & {
  userId: string;
  guestName: string;
  lastAccessIp: string;
};

@Entity('participants')
export class ParticipantEntity extends BaseAppEntity {
  // COLUMNS

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'text' })
  guestName: string;

  @Column({ type: 'inet' })
  lastAccessIp: string;

  // RELATIONS

  @OneToOne(() => ParticipantEntity, (participant) => participant.user)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @OneToMany(() => ChatMessageEntity, (chatMessage) => chatMessage.room)
  chatMessages: ChatMessageEntity[];

  // UTILS

  toDto(): ParticipantDto {
    return {
      id: this.id,
      userId: this.userId,
      guestName: this.guestName,
      lastAccessIp: this.lastAccessIp,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
