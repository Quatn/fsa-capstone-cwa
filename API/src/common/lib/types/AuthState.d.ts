import { UserDetails } from './dto/UserDetails';

export type AuthState = {
  userDetails: UserDetails | null;
  guestName: string | null;
  accessToken: string | null;
};
