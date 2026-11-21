import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.119.0";

const table = "pocket_loky_server_logins";
const pageSize = 200;
const selectedFields = "id,payload,created_at";
const maxRequestLength = 800_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const configuredOrigins =
  Deno.env.get("POCKET_LOKY_ALLOWED_ORIGINS") ?? "http://localhost:5173";
const allowedOrigins = new Set(
  configuredOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const projectUrl = Deno.env.get("SUPABASE_URL");
const publishedKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
const publishableKey =
  (publishedKeys && JSON.parse(publishedKeys).default) ||
  Deno.env.get("SUPABASE_ANON_KEY");
let importedKey: Promise<CryptoKey> | undefined;

type Client = SupabaseClient;
type Login = {
  name: string;
  website: string;
  username: string;
  password: string;
};
type Envelope = { version: number; iv: string; ciphertext: string };
type RecordRow = { id: string; payload: Envelope; created_at: string };

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function bytes(text: string) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function base64(value: ArrayBuffer | Uint8Array) {
  const view = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...view));
}

function serverKey() {
  if (!importedKey) {
    const secret = (Deno.env.get("POCKET_LOKY_ENCRYPTION_KEY") ?? "").trim();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(secret)) {
      throw new HttpError(503, "The vault service is not configured.");
    }
    const keyBytes = bytes(secret);
    importedKey = crypto.subtle
      .importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"])
      .finally(() => keyBytes.fill(0));
  }
  return importedKey;
}

function context(owner: string, id: string) {
  return encoder.encode(`pocket-loky:server:v1:${owner}:${id}`);
}

async function encrypt(
  owner: string,
  id: string,
  login: Login,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const input = encoder.encode(JSON.stringify(login));
  try {
    const result = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: context(owner, id) },
      await serverKey(),
      input,
    );
    return { version: 1, iv: base64(iv), ciphertext: base64(result) };
  } finally {
    input.fill(0);
  }
}

async function decrypt(owner: string, row: RecordRow): Promise<Login> {
  if (row.payload?.version !== 1)
    throw new Error("Unknown encrypted record format");

  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(row.payload.iv),
        additionalData: context(owner, row.id),
      },
      await serverKey(),
      bytes(row.payload.ciphertext),
    ),
  );

  try {
    return JSON.parse(decoder.decode(plain));
  } finally {
    plain.fill(0);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid request.");
  }
  return value as Record<string, unknown>;
}

function checkedId(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value)) {
    throw new HttpError(400, "Invalid login ID.");
  }
  return value.toLowerCase();
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) {
    throw new HttpError(400, "A login field is invalid or too long.");
  }
  return value;
}

function checkedLogin(value: unknown): Login {
  const form = object(value);
  const name = text(form.name, 120).trim();
  const website = text(form.website, 512).trim();
  const username = text(form.username, 254).trim();
  const password = text(form.password, 1024);
  if (!name || !password)
    throw new HttpError(400, "Enter a name and password.");
  return { name, website, username, password };
}

async function query<T>(
  request: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw new HttpError(500, "Could not access the vault. Try again.");
  return data;
}

async function summaries(client: Client, owner: string) {
  const items = [];
  let unreadable = 0;
  let after: string | undefined;

  while (true) {
    let page = client
      .from(table)
      .select(selectedFields)
      .eq("owner_id", owner)
      .order("id")
      .limit(pageSize);
    if (after) page = page.gt("id", after);

    const records = (await query(page)) as RecordRow[];
    const results = await Promise.allSettled(
      records.map(async (row) => {
        const { name, website, username } = await decrypt(owner, row);
        return {
          id: row.id,
          created_at: row.created_at,
          name,
          website,
          username,
        };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") items.push(result.value);
      else unreadable += 1;
    }

    if (records.length < pageSize) break;
    after = records.at(-1)?.id;
  }

  items.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  );

  const migration = (await query(
    client
      .from("pocket_loky_server_imports")
      .select("completed")
      .eq("owner_id", owner)
      .maybeSingle(),
  )) as { completed: boolean } | null;

  const oldRows = migration?.completed
    ? []
    : ((await query(
        client
          .from("pocket_loky_logins")
          .select("id")
          .eq("owner_id", owner)
          .limit(1),
      )) as { id: string }[]);

  return { items, unreadable, canImport: oldRows.length > 0 };
}

async function handle(
  client: Client,
  owner: string,
  body: Record<string, unknown>,
) {
  await serverKey();
  if (body.action === "list") return await summaries(client, owner);

  if (body.action === "import") {
    if (
      !Array.isArray(body.items) ||
      body.items.length > 25 ||
      typeof body.done !== "boolean"
    ) {
      throw new HttpError(400, "Invalid import batch.");
    }
    const rows = await Promise.all(
      body.items.map(async (value) => {
        const item = object(value);
        const id = checkedId(item.id);
        const date = Date.parse(text(item.created_at, 40));
        if (!Number.isFinite(date))
          throw new HttpError(400, "Invalid login date.");

        return {
          id,
          created_at: new Date(date).toISOString(),
          payload: await encrypt(owner, id, checkedLogin(item.login)),
        };
      }),
    );

    await query(
      client.rpc("pocket_loky_import_logins", {
        p_entries: rows,
        p_done: body.done,
      }),
    );
    return { ok: true };
  }

  const id = checkedId(body.id);

  if (body.action === "read") {
    const row = await query(
      client
        .from(table)
        .select(selectedFields)
        .eq("owner_id", owner)
        .eq("id", id)
        .maybeSingle(),
    );
    if (!row) throw new HttpError(404, "This login could not be found.");
    return await decrypt(owner, row as RecordRow);
  }

  if (body.action === "save" || body.action === "edit") {
    const login = checkedLogin(body.login);
    const payload = await encrypt(owner, id, login);
    const change =
      body.action === "edit"
        ? client
            .from(table)
            .update({ payload })
            .eq("owner_id", owner)
            .eq("id", id)
        : client
            .from(table)
            .upsert(
              { owner_id: owner, id, payload },
              { onConflict: "owner_id,id" },
            );

    const row = (await query(change.select("created_at").maybeSingle())) as {
      created_at: string;
    } | null;
    if (!row) throw new HttpError(404, "This login could not be found.");

    const { name, website, username } = login;
    return { id, created_at: row.created_at, name, website, username };
  }

  if (body.action === "delete") {
    await query(client.from(table).delete().eq("owner_id", owner).eq("id", id));
    return { ok: true };
  }

  throw new HttpError(400, "Invalid vault action.");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin && !allowedOrigins.has(origin))
    return new Response(null, { status: 403, headers });

  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  );
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });

  headers.set("Content-Type", "application/json; charset=utf-8");

  function response(status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), { status, headers });
  }

  try {
    if (request.method !== "POST")
      throw new HttpError(405, "Use POST for this request.");
    const auth = request.headers.get("authorization");
    if (!auth || !/^Bearer [\w.-]+$/i.test(auth))
      throw new HttpError(401, "Sign in to open your vault.");
    if (!projectUrl || !publishableKey)
      throw new HttpError(503, "The vault service is not configured.");

    const client = createClient(projectUrl, publishableKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(auth.slice(7));
    if (error || !user) throw new HttpError(401, "Please sign in again.");

    if (Number(request.headers.get("content-length")) > maxRequestLength) {
      throw new HttpError(413, "This request is too large.");
    }
    const raw = await request.text();
    if (raw.length > maxRequestLength)
      throw new HttpError(413, "This request is too large.");

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid request.");
    }

    return response(200, await handle(client, user.id, object(body)));
  } catch (error) {
    if (error instanceof HttpError)
      return response(error.status, { error: error.message });
    return response(500, { error: "Could not open this vault. Try again." });
  }
});
