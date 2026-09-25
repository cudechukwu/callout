import {
  act,
  createSeries,
  getView,
  joinSeries,
  lock,
  lookupInvite,
  MpError,
  requestRivalry,
  requireUser,
  respondRivalry,
} from "@/lib/multiplayer/server";

/**
 * One endpoint per challenge command: POST /api/mp/<action> with a JSON
 * body and the player's access token. See lib/multiplayer/server.ts.
 */
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  try {
    const caller = await requireUser(request);
    const userId = caller.id;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    switch (action) {
      case "create":
        return Response.json(await createSeries(caller, body.name));
      case "invite":
        return Response.json(await lookupInvite(userId, body.token));
      case "join":
        return Response.json(await joinSeries(userId, body.token, body.name));
      case "view":
        return Response.json(await getView(userId, body.roundId));
      case "act":
        return Response.json(await act(userId, body.roundId, body.sequence, body.action));
      case "lock":
        return Response.json(await lock(userId, body.roundId));
      case "request":
        return Response.json(await requestRivalry(userId, body.roundId, body.kind));
      case "respond":
        return Response.json(await respondRivalry(userId, body.roundId, body.requestId, body.accept));
      default:
        return Response.json({ error: "not_found" }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof MpError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error(`[mp/${action}]`, error);
    return Response.json({ error: "server_error", message: "Something went wrong" }, { status: 500 });
  }
}
