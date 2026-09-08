import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ParticipantReader,
  ParticipantWriter,
  RoomManager,
  RoomReader,
  RoomWriter,
} from './room.contracts';
import { ParticipantDto, ParticipantEntity } from './entity/participant.entity';
import { IBaseAppEntity } from 'src/common/entity/BaseAppEntity';
import { FindOneOptions, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomDto, RoomEntity } from './entity/room.entity';
import { BoardElementEntity } from './entity/board-element.entity';
import { RedisService } from 'src/redis/redis.service';
import { ApiError } from 'src/common/lib/errors/ApiError';
import { ParticipantMetadata } from 'src/common/lib/types/dto/ParticipantMetadata';
import { AllParticipantThemeColors } from 'src/common/lib/types/dto/ParticipantThemeColors';

@Injectable()
export class RoomService
  implements
  ParticipantReader,
  ParticipantWriter,
  RoomReader,
  RoomWriter,
  RoomManager {
  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(ParticipantEntity)
    private participantRepository: Repository<ParticipantEntity>,
    @InjectRepository(RoomEntity)
    private roomRepository: Repository<RoomEntity>,
    @InjectRepository(BoardElementEntity)
    private boardElementRepository: Repository<BoardElementEntity>,
  ) { }

  private roomKey(roomId: string): string {
    return `room:${roomId}`;
  }

  private roomParticipantsKey(roomId: string, participantId: string): string {
    return `room:${roomId}:participants:${participantId}`;
  }

  private boardElementKey(boardElementId: string): string {
    return `board-element:${boardElementId}`;
  }

  async findParticipantById(id: string): Promise<ParticipantEntity | null> {
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

  async setParticipantLastAccessIp(
    participantId: string,
    lastAccessIp: string,
  ): Promise<void> {
    await this.participantRepository.update(
      { id: participantId },
      { lastAccessIp },
    );
  }

  async findRoomById(
    id: string,
    options?: FindOneOptions<RoomEntity>,
  ): Promise<RoomEntity | null> {
    return await this.roomRepository.findOne({ where: { id }, ...options });
  }

  async createRoom(
    room: Omit<RoomDto, keyof IBaseAppEntity>,
  ): Promise<RoomEntity> {
    return await this.roomRepository.save({
      ...room,
      id: undefined,
    });
  }

  async checkIfRoomIsLoaded(roomId: string): Promise<boolean> {
    return this.redisService.exists(this.roomKey(roomId));
  }

  async checkParticipantHasJoinedRoom(
    roomId: string,
    participantId: string,
  ): Promise<boolean> {
    return this.redisService.exists(
      this.roomParticipantsKey(roomId, participantId),
    );
  }

  async loadRoomToDatastore(roomId: string): Promise<void> {
    const room = await this.findRoomById(roomId, {
      relations: {
        boardElements: true,
      },
    });

    if (!room) {
      throw new ApiError(
        'Room not found',
        HttpStatus.NOT_FOUND,
        'ERR_ROOM_NOT_FOUND',
      );
    }

    await this.redisService.set(this.roomKey(roomId), room.toDto());

    await Promise.all(
      room.boardElements.map((boardElement) =>
        this.redisService.set(
          this.boardElementKey(boardElement.id),
          boardElement.toDto(),
        ),
      ),
    );
  }

  async joinParticipantToRoom(
    roomId: string,
    participantId: string,
  ): Promise<void> {
    const room = await this.findRoomById(roomId);

    if (!room) {
      throw new ApiError(
        'Room not found',
        HttpStatus.NOT_FOUND,
        'ERR_ROOM_NOT_FOUND',
      );
    }

    const participant = await this.findParticipantById(participantId);

    if (!participant) {
      throw new ApiError(
        'Participant not found',
        HttpStatus.NOT_FOUND,
        'ERR_PARTICIPANT_NOT_FOUND',
      );
    }

    const participantMetadata: ParticipantMetadata = {
      joinedAt: new Date().toISOString(),
      displayName:
        participant?.user?.name ?? participant?.guestName ?? 'Unknown User',
      // random color
      themeColor:
        AllParticipantThemeColors[
        Math.floor(Math.random() * AllParticipantThemeColors.length)
        ],
      cursorX: NaN,
      cursorY: NaN,
    };

    await this.redisService.hSet(
      this.roomParticipantsKey(roomId, participantId),
      participantMetadata,
    );
  }

  async getLoadedRoom(roomId: string): Promise<RoomDto | null> {
    return this.redisService.get<RoomDto>(this.roomKey(roomId));
  }
}
