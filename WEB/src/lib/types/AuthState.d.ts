import { UserDetails } from "./dto/UserDetails";

export type AuthState = {
  userDetails: UserDetails | null;
  accessToken: string | null;
};
