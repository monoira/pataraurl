import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { store } from "../store";
import { shortenApi } from "../api/shortenApi";
import { redirectUrlSchema } from "../schemas/shorten.schema";

export async function shortRedirectLoader({ params }: LoaderFunctionArgs) {
  const { shortCode } = params;

  if (!shortCode) {
    throw new Response("Not Found", { status: 404 });
  }

  try {
    const { url } = await store
      .dispatch(shortenApi.endpoints.getShorten.initiate(shortCode))
      .unwrap();

    const targetUrl = redirectUrlSchema.parse(url);

    return redirect(targetUrl);
  } catch {
    throw new Response("Short link not found", { status: 404 });
  }
}
