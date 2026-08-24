import { User } from './entity/user.entity';

export interface UserReader {
  findById(id: string): Promise<User | null>;
}

export interface UserWriter {
  createUser(
    user: Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt'>,
    password: string,
  ): Promise<User>;
}

export interface UserAuthenticator {
  loginWithEmail(email: string, password: string): Promise<User>;
}

export const USER_READER = Symbol('USER_READER');
export const USER_WRITER = Symbol('USER_WRITER');
export const USER_AUTHENTICATOR = Symbol('USER_AUTHENTICATOR');
