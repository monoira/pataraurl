import { apiSlice } from "./apiSlice";

export type ShortenItem = {
  id: string;
  url: string;
  nickname: string | null;
  shortCode: string;
  createdAt: string;
  updatedAt: string;
  accessCount?: number;
};

export const shortenApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createShorten: builder.mutation<ShortenItem, { url: string; nickname?: string | null }>({
      query: (body) => ({ url: "/shorten", method: "POST", body }),
      invalidatesTags: ["Shorten"],
    }),
    getShorten: builder.query<ShortenItem, string>({
      query: (shortCode) => `/shorten/${shortCode}`,
    }),
    getShortenStats: builder.query<ShortenItem & { accessCount: number }, string>({
      query: (shortCode) => `/shorten/${shortCode}/stats`,
      providesTags: (_result, _error, shortCode) => [{ type: "Shorten", id: shortCode }],
    }),
    getAllShortens: builder.query<ShortenItem[], void>({
      query: () => "/shorten/all-stats",
      providesTags: ["Shorten"],
    }),
    updateShorten: builder.mutation<
      ShortenItem,
      { shortCode: string; url: string; nickname?: string | null }
    >({
      query: ({ shortCode, url, nickname }) => ({
        url: `/shorten/${shortCode}`,
        method: "PUT",
        body: { url, nickname },
      }),
      invalidatesTags: (_result, _error, { shortCode }) => [
        "Shorten",
        { type: "Shorten", id: shortCode },
      ],
    }),
    deleteShorten: builder.mutation<void, string>({
      query: (shortCode) => ({
        url: `/shorten/${shortCode}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, shortCode) => [
        "Shorten",
        { type: "Shorten", id: shortCode },
      ],
    }),
  }),
});

export const {
  useCreateShortenMutation,
  useGetShortenQuery,
  useGetShortenStatsQuery,
  useUpdateShortenMutation,
  useDeleteShortenMutation,
  useGetAllShortensQuery,
} = shortenApi;
