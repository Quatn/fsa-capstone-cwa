import { IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { ParticipantDto, ParticipantEntity } from './entity/participant.entity';

export interface ParticipantReader {
  findById(id: string): Promise<ParticipantEntity | null>;
}

export interface ParticipantWriter {
  createParticipant(
    participant: Omit<ParticipantDto, keyof IBaseAppEntity>,
  ): Promise<ParticipantEntity>;
}

export const PARTICIPANT_READER = Symbol('PARTICIPANT_READER');
export const PARTICIPANT_WRITER = Symbol('PARTICIPANT_WRITER');
