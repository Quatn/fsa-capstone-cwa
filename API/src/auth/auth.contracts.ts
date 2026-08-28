import { UserDetails } from 'src/common/dto/UserDetails';
import {
  AuthSessionDto,
  AuthSessionEntity,
} from './entity/auth-session.entity';

export interface AuthSessionValidator {
  authenticateUser(userId: string): Promise<{
    authSession: AuthSessionEntity;
    refreshToken: string;
  }>;

  verifyAndRefreshTokenAndAuthSession(
    refreshToken: string,
  ): Promise<AuthSessionEntity>;

  refreshByAuthSession(
    authSession: AuthSessionDto,
  ): Promise<{ userDetails: UserDetails; accessToken: string }>;
}

export const AUTH_SESSION_VALIDATOR = Symbol('AUTH_SESSION_VALIDATOR');
