import { Injectable } from '@nestjs/common';
import { ParticipantReader, ParticipantWriter } from './room.contracts';
import { ParticipantDto, ParticipantEntity } from './entity/participant.entity';
import { IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class RoomService implements ParticipantReader, ParticipantWriter {
  constructor(
    @InjectRepository(ParticipantEntity)
    private participantRepository: Repository<ParticipantEntity>,
  ) { }

  async findById(id: string): Promise<ParticipantEntity | null> {
    return await this.participantRepository.findOne({
      where: { id },
      relations: {
        user: true,
      },
    });
  }

  async createParticipant(
    participant: Omit<ParticipantDto, keyof IBaseAppEntity>,
  ): Promise<ParticipantEntity> {
    return await this.participantRepository.save({
      ...participant,
      id: undefined,
    });
  }
}
