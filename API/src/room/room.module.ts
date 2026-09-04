import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipantEntity } from './entity/participant.entity';
import { PARTICIPANT_READER, PARTICIPANT_WRITER } from './room.contracts';

@Module({
  imports: [TypeOrmModule.forFeature([ParticipantEntity])],
  controllers: [RoomController],
  providers: [
    RoomService,
    {
      provide: PARTICIPANT_READER,
      useExisting: RoomService,
    },
    {
      provide: PARTICIPANT_WRITER,
      useExisting: RoomService,
    },
  ],
  exports: [PARTICIPANT_READER, PARTICIPANT_WRITER],
})
export class RoomModule { }
