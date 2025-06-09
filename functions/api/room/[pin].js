// Pages Function Handler - Entry point for WebSocket upgrades
export async function onRequest(context) {
  const { request, env, params } = context;
  const { pin } = params;

  if (!pin || !/^\d{4,8}$/.test(pin)) {
     return new Response("Invalid room PIN format.", { status: 400 });
  }
   const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
       // Handle potential non-websocket requests to this path
       return new Response('Expected websocket', { status: 426 });
   }
   if (!env.STUDY_ROOM_DO) {
        console.error("Durable Object Binding 'STUDY_ROOM_DO' not configured!");
       return new Response("Server configuration error", { status: 500 });
   }

  try {
    const id = env.STUDY_ROOM_DO.idFromName(pin); 
    const stub = env.STUDY_ROOM_DO.get(id);
    return await stub.fetch(request);
  } catch (e) {
     console.error("Worker error:", e);
     return new Response(e.message || "Server Error", { status: 500 });
  }
}