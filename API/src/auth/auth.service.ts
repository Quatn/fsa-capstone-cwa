import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthSession } from './entity/auth-session.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RefreshTokenPayload } from './types/RefreshToken';
import { ApiError } from 'src/common/lib/errors/ApiError';
import { compareToken, hashToken } from 'src/common/utils/token-hash-utils';
import { UserService } from 'src/user/user.service';
import check from 'check-types';
import { UserDetails } from 'src/common/dto/UserDetails';

@Injectable()
export class AuthService {
  private readonly refreshTokenExpirationSeconds: number;
  private readonly accessTokenExpirationSeconds: number;

  constructor(
    @InjectRepository(AuthSession)
    private authSessionsRepository: Repository<AuthSession>,
    private jwtService: JwtService,
    private userService: UserService,
  ) {
    const refreshTokenExpirationSeconds = parseInt(
      process.env.REFRESH_TOKEN_EXPIRATION_SECONDS ?? '',
    );

    if (!check.number(refreshTokenExpirationSeconds)) {
      throw new Error(
        'REFRESH_TOKEN_EXPIRATION_SECONDS environment variable is not set or is not valid',
      );
    }

    this.refreshTokenExpirationSeconds = refreshTokenExpirationSeconds;

    const accessTokenExpirationSeconds = parseInt(
      process.env.ACCESS_TOKEN_EXPIRATION_SECONDS ?? '',
    );

    if (!check.number(accessTokenExpirationSeconds)) {
      throw new Error(
        'ACCESS_TOKEN_EXPIRATION_SECONDS environment variable is not set or is not valid',
      );
    }

    this.accessTokenExpirationSeconds = accessTokenExpirationSeconds;
  }

  async createAuthSession(
    userId: string,
    uuid: string,
    tokenHash: string,
    expiresAt: Date,
    deviceInfo: string,
  ): Promise<AuthSession> {
    const authSession = new AuthSession();
    authSession.userId = userId;
    authSession.uuid = uuid;
    authSession.tokenHash = tokenHash;
    authSession.expiresAt = expiresAt;
    authSession.revoked = false;
    authSession.deviceInfo = deviceInfo;

    await this.authSessionsRepository.save(authSession);

    return authSession;
  }

  async authenticateUser(userId: string): Promise<{
    authSession: AuthSession;
    refreshToken: string;
  }> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.refreshTokenExpirationSeconds * 1000,
    );

    const uuid = randomUUID();
    const refreshToken = await this.jwtService.signAsync<RefreshTokenPayload>(
      { uuid },
      { expiresIn: this.refreshTokenExpirationSeconds },
    );

    const tokenHash = await hashToken(refreshToken);

    // TODO: Add device info
    const createdSession = await this.createAuthSession(
      userId,
      uuid,
      tokenHash,
      expiresAt,
      'temp',
    );

    return {
      authSession: createdSession,
      refreshToken,
    };
  }

  async verifyAndRefreshTokenAndAuthSession(
    refreshToken: string,
  ): Promise<AuthSession> {
    try {
      const { uuid } =
        await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);

      const authSession = await this.authSessionsRepository.findOne({
        where: { uuid },
      });

      if (!authSession) {
        throw new Error('Auth session not found');
      }

      if (authSession.revoked) {
        throw new Error('Auth session revoked');
      }

      if (authSession.expiresAt < new Date()) {
        throw new Error('Auth session expired');
      }

      const isTokenSameAsSaved = await compareToken(
        refreshToken,
        authSession.tokenHash,
      );
      if (!isTokenSameAsSaved) {
        throw new Error(
          'Refresh token not the same as the one saved on the database',
        );
      }

      // TODO: Handle device info

      return authSession;
    } catch {
      throw new ApiError(
        'Invalid refresh token',
        HttpStatus.UNAUTHORIZED,
        'ERR_SESSION_EXPIRED_OR_INVALID',
      );
    }
  }

  async refreshByAuthSession(
    authSession: AuthSession,
  ): Promise<{ userDetails: UserDetails; accessToken: string }> {
    const user = await this.userService.getUserById(authSession.userId);
    const accessToken = await this.jwtService.signAsync(
      { userId: user.id },
      { expiresIn: this.accessTokenExpirationSeconds },
    );

    return {
      userDetails: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
    };
  }
}
