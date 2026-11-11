import { defineMiddleware } from "astro:middleware";
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  if (
    context.url.pathname.startsWith("/studio") ||
    context.url.pathname === "/beta"
  )
    response.headers.set("Cache-Control", "private, no-store");
  return response;
});
