import { Http3Server } from "@fails-components/webtransport";
import { readFileSync } from "fs";
import { createHash, X509Certificate } from "crypto";
import { createClient } from "redis";

const cert = readFileSync("./cert.pem");
const key = readFileSync("./key.pem");

const h3Server = new Http3Server({
  port: 5000,
  host: "0.0.0.0",
  secret: "changeme",
  cert,
  privKey: key,
});

const x509 = new X509Certificate(cert);
const certHashBase64 = createHash("sha256").update(x509.raw).digest("base64");
console.log("Cert hash (dán vào client):", certHashBase64);

const redis = createClient();
redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();

const ROOM_KEY = "board:demo-room";
const roomSessions = new Set<any>(); // demo: 1 phòng cố định, nên chỉ cần 1 Set

async function broadcastStreamOp(payload: Buffer, exclude: any) {
  for (const s of roomSessions) {
    if (s === exclude) continue;
    try {
      const stream = await s.createUnidirectionalStream();
      const writer = stream.getWriter();
      await writer.write(payload);
      await writer.close();
    } catch {
      // session có thể vừa đóng — bỏ qua, sẽ tự bị dọn khỏi registry
    }
  }
}

// ---- GHI: nhận operation qua unidirectional stream, merge field-level, ghi Redis ----
async function handleWriteStream(stream: ReadableStream<Uint8Array>, session: any) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const rawBytes = Buffer.concat(chunks);
  const op = JSON.parse(rawBytes.toString("utf-8"));
  const hashField = `${op.elementId}:${op.field}`;

  const existingRaw = await redis.hGet(ROOM_KEY, hashField);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  // CRDT merge tối giản: Last-Write-Wins theo timestamp, ở cấp FIELD (không phải cấp object)
  if (!existing || op.time[0] > existing.time[0]) {
    await redis.hSet(ROOM_KEY, hashField, JSON.stringify({ value: op.value, time: op.time }));
    console.log(`merged  ${hashField} =`, op.value);
    await broadcastStreamOp(rawBytes, session); // đẩy cho các session khác trong phòng
  } else {
    console.log(`skipped ${hashField} (stale)`);
  }
}

// ---- ĐỌC: client gửi "GET_STATE" qua bidirectional stream, trả về toàn bộ board ----
async function handleReadStream(stream: {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}) {
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const { value } = await reader.read();
  if (new TextDecoder().decode(value) === "GET_STATE") {
    const all = await redis.hGetAll(ROOM_KEY);
    await writer.write(new TextEncoder().encode(JSON.stringify(all)));
    console.log(`sent state (${Object.keys(all).length} fields)`);
  }
  await writer.close();
}

// ---- DATAGRAM: cursor — relay cho các session KHÁC, KHÔNG chạm Redis ----
async function handleDatagrams(session: any) {
  const reader = session.datagrams.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Relay cho các session khác trong phòng — giờ đã broadcast thật,
    // không cần echo lại chính mình như "ghost cursor" tạm thời trước đó nữa.
    for (const s of roomSessions) {
      if (s === session) continue;
      const w = s.datagrams.writable.getWriter();
      w.write(value).catch(() => { });
      w.releaseLock();
    }
  }
}

(async () => {
  const sessionStream = await h3Server.sessionStream("/wt");
  const sessionReader = sessionStream.getReader();

  while (true) {
    const { done, value: session } = await sessionReader.read();
    if (done) break;

    await session.ready;
    console.log("client connected, total:", roomSessions.size + 1);
    roomSessions.add(session);
    session.closed
      .then(() => roomSessions.delete(session))
      .catch(() => roomSessions.delete(session));

    handleDatagrams(session);

    const uniReader = session.incomingUnidirectionalStreams.getReader();
    (async () => {
      while (true) {
        const { done, value: s } = await uniReader.read();
        if (done) break;
        handleWriteStream(s, session);
      }
    })();

    const bidiReader = session.incomingBidirectionalStreams.getReader();
    (async () => {
      while (true) {
        const { done, value: s } = await bidiReader.read();
        if (done) break;
        handleReadStream(s);
      }
    })();
  }
})();

h3Server.startServer();