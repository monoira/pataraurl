import { apiSlice } from "./apiSlice";
import { type CreateUserInput, type User, Role } from "../types/auth";

export type UserSortField =
  "name" | "email" | "role" | "createdAt" | "updatedAt";
export type SortOrder = "ASC" | "DESC";

export const usersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<User, void>({ query: () => "/users/me" }),
    getUsers: builder.query<
      User[],
      {
        page: number;
        limit: number;
        role?: Role;
        sortBy: UserSortField;
        sortOrder: SortOrder;
      }
    >({
      providesTags: ["Users"],
      query: ({ page, limit, role, sortBy, sortOrder }) => ({
        url: "/users",
        params: {
          page,
          limit,
          sortBy,
          sortOrder,
          ...(role ? { role } : {}),
        },
      }),
    }),
    deleteUser: builder.mutation<User, number>({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: ["Users"],
    }),
    updateUser: builder.mutation<User, { id: number; role: Role }>({
      query: ({ id, role }) => ({
        url: `/users/${id}`,
        method: "PATCH",
        body: { role },
      }),
      invalidatesTags: ["Users"],
    }),
    createUser: builder.mutation<User, CreateUserInput>({
      query: (body) => ({ url: "/users", method: "POST", body }),
    }),
  }),
});

export const {
  useGetMeQuery,
  useGetUsersQuery,
  useDeleteUserMutation,
  useUpdateUserMutation,
  useCreateUserMutation,
} = usersApi;
