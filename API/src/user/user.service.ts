import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { Repository } from 'typeorm';
import { ApiError } from 'src/common/lib/errors/ApiError';
import {
  comparePassword,
  hashPassword,
} from 'src/common/utils/password-hash-utils';
import { UserRole } from 'src/common/dto/UserRoles';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async loginWithEmail(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      throw new ApiError(
        'User not found',
        HttpStatus.NOT_FOUND,
        'ERR_USER_NOT_FOUND',
      );
    }

    const isPasswordCorrect = await comparePassword(
      password,
      user.passwordHash,
    );

    if (!isPasswordCorrect) {
      throw new ApiError(
        'Incorrect password',
        HttpStatus.UNAUTHORIZED,
        'ERR_INVALID_PASSWORD',
      );
    }

    return user;
  }

  async createUser(
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ): Promise<User> {
    const userExists = await this.usersRepository.findOne({
      where: { email },
    });

    if (userExists) {
      throw new ApiError(
        'User already exists',
        HttpStatus.BAD_REQUEST,
        'ERR_USER_ALREADY_EXISTS',
      );
    }

    const hashedPassword = await hashPassword(password);

    return this.usersRepository.save({
      name,
      passwordHash: hashedPassword,
      email,
      role,
    });
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError(
        'User not found',
        HttpStatus.NOT_FOUND,
        'ERR_USER_NOT_FOUND',
      );
    }

    return user;
  }
}
