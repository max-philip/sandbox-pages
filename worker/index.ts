export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/time") {
      return Response.json(
        { t: Date.now() },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (url.pathname === "/api/whoami") {
      const cf = request.cf as IncomingRequestCfProperties | undefined;
      return Response.json(
        {
          ip: request.headers.get("cf-connecting-ip"),
          city: cf?.city ?? null,
          region: cf?.region ?? null,
          country: cf?.country ?? null,
          colo: cf?.colo ?? null,
          isp: cf?.asOrganization ?? null,
          timezone: cf?.timezone ?? null,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;