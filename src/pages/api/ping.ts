import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
    headers: { "Content-Type": "application/json" },
  });
};
