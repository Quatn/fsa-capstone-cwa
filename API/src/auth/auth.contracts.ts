import { UserDetails } from 'src/common/dto/UserDetails';
import { AuthSession } from './entity/auth-session.entity';

export interface AuthSessionValidator {
  authenticateUser(userId: string): Promise<{
    authSession: AuthSession;
    refreshToken: string;
  }>;

  verifyAndRefreshTokenAndAuthSession(
    refreshToken: string,
  ): Promise<AuthSession>;

  refreshByAuthSession(
    authSession: AuthSession,
  ): Promise<{ userDetails: UserDetails; accessToken: string }>;
}

export const AUTH_SESSION_VALIDATOR = Symbol('AUTH_SESSION_VALIDATOR');
