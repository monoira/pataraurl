import type { Request } from 'express';
import { Role } from '../enums/role.enum.js';

export type AuthenticatedUser = {
  id: number;
  email: string;
  role: Role;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export type RefreshRequest = Request & {
  cookies: { refresh_token: string };
  user: { id: number; email: string };
};
