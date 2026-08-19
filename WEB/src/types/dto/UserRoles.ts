export const AllUserRoles = [
  "Admin",
  "User",
  "Guest",
] as const;

export type UserRole = typeof AllUserRoles[number];
