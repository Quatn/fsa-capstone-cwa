import { Http3Server } from "@fails-components/webtransport";
import { readFileSync } from "fs";
import { createHash, X509Certificate } from "crypto";
import { createClient } from "redis";
import { ELEMENT_TYPES, parseOp, type Op } from "./types.js";

const cert = readFileSync(process.env.HTTP3_CERT_FILE_PATH ?? "./cert.pem");
const key = readFileSync(process.env.HTTP3_KEY_FILE_PATH ?? "./key.pem");

const h3Server = new Http3Server({
  port: Number(process.env.PORT ?? 5000),
  host: process.env.HTTP3_HOST ?? "0.0.0.0",
  secret: process.env.HTTP3_SECRET ?? "changeme",
  cert,
  privKey: key,
});

const x509 = new X509Certificate(cert);
const certHashBase64 = createHash("sha256").update(x509.raw).digest("base64");
console.log("Cert hash (dán vào client):", certHashBase64);

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();

interface RoomState {
  sessions: Set<any>;
}
const rooms = new Map<string, RoomState>();
const sessionRoomId = new Map<any, string>(); // session -> roomId, để biết dọn khỏi phòng nào lúc đóng kết nối

function roomKeyFor(roomId: string): string {
  return `board:${roomId}`;
}

function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = { sessions: new Set() };
    rooms.set(roomId, room);
  }
  return room;
}

function joinRoom(session: any, roomId: string): void {
  const previous = sessionRoomId.get(session);
  if (previous === roomId) return; // gọi lại GET_STATE trên phòng đang ở — không cần làm gì thêm
  if (previous) getOrCreateRoom(previous).sessions.delete(session); // hiếm: đổi phòng giữa chừng
  getOrCreateRoom(roomId).sessions.add(session);
  sessionRoomId.set(session, roomId);
  console.log(`session joined room "${roomId}" (${rooms.get(roomId)!.sessions.size} in room now)`);
}

function leaveRoom(session: any): void {
  const roomId = sessionRoomId.get(session);
  if (!roomId) return;
  const room = rooms.get(roomId);
  room?.sessions.delete(session);
  sessionRoomId.delete(session);
  if (room && room.sessions.size === 0) rooms.delete(roomId);
}

const TOMBSTONE_TTL_MS = Number(process.env.TOMBSTONE_TTL_MS ?? 24 * 60 * 60 * 1000); // 24h
const TOMBSTONE_SWEEP_INTERVAL_MS = Number(process.env.TOMBSTONE_SWEEP_INTERVAL_MS ?? 10 * 60 * 1000); // 10p

/** Shape actually stored in the Redis hash for every `elementId:field` entry. */
interface StoredField {
  value: unknown;
  time: [number, string];
}

function parseStoredField(raw: string): StoredField | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  const t = p.time;
  if (!Array.isArray(t) || t.length !== 2 || typeof t[0] !== "number" || typeof t[1] !== "string") {
    return null;
  }
  return { value: p.value, time: [t[0], t[1]] };
}

async function sweepExpiredTombstones(): Promise<void> {
  for await (const roomKeys of redis.scanIterator({ MATCH: "board:*", COUNT: 100 })) {
    for (const roomKey of roomKeys) {
      await sweepRoomTombstones(roomKey).catch((err) =>
        console.error(`tombstone sweep error for ${roomKey}:`, err)
      );
    }
  }
}

async function sweepRoomTombstones(roomKey: string): Promise<void> {
  const all = await redis.hGetAll(roomKey);
  const now = Date.now();

  const candidateIds: string[] = [];
  for (const [hashField, raw] of Object.entries(all)) {
    if (!hashField.endsWith(":deleted")) continue;
    const parsed = parseStoredField(raw);
    if (!parsed || parsed.value !== true) continue;
    if (now - parsed.time[0] < TOMBSTONE_TTL_MS) continue;
    candidateIds.push(hashField.slice(0, -":deleted".length));
  }
  if (candidateIds.length === 0) return;

  let purgedElements = 0;
  let purgedFields = 0;
  for (const elementId of candidateIds) {
    const recheckRaw = await redis.hGet(roomKey, `${elementId}:deleted`);
    const recheck = recheckRaw ? parseStoredField(recheckRaw) : null;
    if (!recheck || recheck.value !== true || now - recheck.time[0] < TOMBSTONE_TTL_MS) continue;

    const fields = Object.keys(all).filter((f) => f.startsWith(`${elementId}:`));
    if (fields.length === 0) continue;
    await redis.hDel(roomKey, fields);
    purgedElements += 1;
    purgedFields += fields.length;
  }
  if (purgedElements > 0) {
    console.log(`tombstone sweep (${roomKey}): purged ${purgedFields} fields from ${purgedElements} elements`);
  }
}

async function broadcastStreamOp(payload: Uint8Array, exclude: any, roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const s of room.sessions) {
    if (s === exclude) continue;
    try {
      const stream = await s.createUnidirectionalStream();
      const writer = stream.getWriter();
      await writer.write(payload);
      await writer.close();
    } catch {
      // session có thể vừa đóng — bỏ qua, sẽ tự bị dọn khỏi registry qua session.closed
    }
  }
}

async function handleWriteStream(stream: ReadableStream<Uint8Array>, session: any): Promise<void> {
  const roomId = sessionRoomId.get(session);
  if (!roomId) {
    console.log("dropped: write op before session joined a room");
    return;
  }
  const roomKey = roomKeyFor(roomId);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const rawBytes = Buffer.concat(chunks);

  let raw: unknown;
  try {
    raw = JSON.parse(rawBytes.toString("utf-8"));
  } catch {
    console.log("dropped: invalid JSON");
    return;
  }

  const op: Op | null = parseOp(raw);
  if (!op) {
    console.log("dropped: invalid op", raw);
    return;
  }

  const hashField = `${op.elementId}:${op.field}`;

  const existingRaw = await redis.hGet(roomKey, hashField);
  const existing = existingRaw ? parseStoredField(existingRaw) : null;

  // CRDT merge tối giản: Last-Write-Wins theo timestamp, ở cấp FIELD (không phải cấp object)
  // "points" (nét vẽ tự do / line) cũng chỉ là 1 field như "position"/"strokeColor" — không cần xử lý riêng
  if (!existing || op.time[0] > existing.time[0]) {
    const stored: StoredField = { value: op.value, time: op.time };
    await redis.hSet(roomKey, hashField, JSON.stringify(stored));

    if (op.field !== "deleted") {
      const typeField = `${op.elementId}:__type`;
      const storedType: StoredField = { value: op.type, time: op.time };
      await redis.hSetNX(roomKey, typeField, JSON.stringify(storedType));
    }

    console.log(`merged  [${roomId}] ${hashField}`);
    await broadcastStreamOp(rawBytes, session, roomId); // đẩy real-time cho các session khác trong phòng
  } else {
    console.log(`skipped [${roomId}] ${hashField} (stale)`);
  }
}

/** Shape of the one request bidirectional streams carry today. */
interface JoinAndGetStateRequest {
  cmd: "GET_STATE";
  roomId: string;
}

function parseJoinAndGetStateRequest(raw: string): JoinAndGetStateRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (p.cmd !== "GET_STATE" || typeof p.roomId !== "string" || p.roomId.length === 0) return null;
  return { cmd: "GET_STATE", roomId: p.roomId };
}

async function handleReadStream(stream: any, session: any): Promise<void> {
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const { value } = await reader.read();
  if (value) {
    const req = parseJoinAndGetStateRequest(new TextDecoder().decode(value));
    if (req) {
      joinRoom(session, req.roomId);
      const all = await redis.hGetAll(roomKeyFor(req.roomId));
      await writer.write(new TextEncoder().encode(JSON.stringify(all)));
      console.log(`sent state [${req.roomId}] (${Object.keys(all).length} fields)`);
    } else {
      console.log("dropped: invalid GET_STATE request");
    }
  }
  await writer.close();
}

async function handleDatagrams(session: any): Promise<void> {
  const reader = session.datagrams.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const roomId = sessionRoomId.get(session);
    if (!roomId) continue; // chưa join phòng nào (chưa gửi GET_STATE lần đầu) — bỏ qua
    const room = rooms.get(roomId);
    if (!room) continue;
    for (const s of room.sessions) {
      if (s === session) continue;
      const w = s.datagrams.writable.getWriter();
      w.write(value).catch(() => { });
      w.releaseLock();
    }
  }
}

(async () => {
  const sessionStream = h3Server.sessionStream("/wt");
  const sessionReader = sessionStream.getReader();

  while (true) {
    const { done, value: session } = await sessionReader.read();
    if (done) break;

    await session.ready;
    console.log("client connected");
    session.closed.then(() => leaveRoom(session)).catch(() => leaveRoom(session));

    handleDatagrams(session).catch((err) => console.error("datagram loop error:", err));

    const uniReader = session.incomingUnidirectionalStreams.getReader();
    (async () => {
      while (true) {
        const { done, value: s } = await uniReader.read();
        if (done) break;
        handleWriteStream(s, session).catch((err) => console.error("write stream error:", err));
      }
    })().catch((err) => console.error("uni stream loop error:", err));

    const bidiReader = session.incomingBidirectionalStreams.getReader();
    (async () => {
      while (true) {
        const { done, value: s } = await bidiReader.read();
        if (done) break;
        handleReadStream(s, session).catch((err) => console.error("read stream error:", err));
      }
    })().catch((err) => console.error("bidi stream loop error:", err));
  }
})();

h3Server.startServer();
console.log(`Server started at port ${h3Server.port ?? process.env.PORT ?? 5000}`);
console.log("Element types supported:", ELEMENT_TYPES.join(", "));

sweepExpiredTombstones().catch((err) => console.error("tombstone sweep error:", err));
setInterval(() => {
  sweepExpiredTombstones().catch((err) => console.error("tombstone sweep error:", err));
}, TOMBSTONE_SWEEP_INTERVAL_MS);