export enum Role {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type LoginInput = { email: string; password: string };
export type CreateUserInput = LoginInput & { name: string };
export type AuthResponse = { access_token: string };
