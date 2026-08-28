import { BaseAppEntity, IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { Column, Entity, OneToMany } from 'typeorm';
import { BoardElementEntity } from './board-element.entity';
import { ChatMessageEntity } from './chat-message.entity';

export type RoomDto = IBaseAppEntity & {
  lastActiveAt: Date;
  secret: string;
};

@Entity('rooms')
export class RoomEntity extends BaseAppEntity {
  // COLUMNS

  @Column()
  lastActiveAt: Date;

  @Column({ type: 'text' })
  secret: string;

  // RELATIONS

  @OneToMany(() => BoardElementEntity, (boardElement) => boardElement.room)
  boardElements: BoardElementEntity[];

  @OneToMany(() => ChatMessageEntity, (chatMessage) => chatMessage.room)
  chatMessages: ChatMessageEntity[];

  // UTILS

  toDto(): RoomDto {
    return {
      id: this.id,
      lastActiveAt: this.lastActiveAt,
      secret: this.secret,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
