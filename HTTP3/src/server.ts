import { Http3Server } from "@fails-components/webtransport";
import { readFileSync } from "fs";
import { createHash, X509Certificate } from "crypto";
import { createClient } from "redis";

const cert = readFileSync("./cert.pem");
const key = readFileSync("./key.pem");

console.log(cert);
console.log(key);


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

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});
redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();

const ROOM_KEY = "board:demo-room";

// ---- GHI: nhận operation qua unidirectional stream, merge field-level, ghi Redis ----
async function handleWriteStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const op = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  const hashField = `${op.elementId}:${op.field}`;

  const existingRaw = await redis.hGet(ROOM_KEY, hashField);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  // CRDT merge tối giản: Last-Write-Wins theo timestamp, ở cấp FIELD (không phải cấp object)
  if (!existing || op.time[0] > existing.time[0]) {
    await redis.hSet(ROOM_KEY, hashField, JSON.stringify({ value: op.value, time: op.time }));
    console.log(`merged  ${hashField} =`, op.value);
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

// ---- DATAGRAM: cursor — chỉ relay, KHÔNG chạm Redis (khác biệt cố ý với Stream) ----
async function handleDatagrams(session: any) {
  const reader = session.datagrams.readable.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
    // Cố tình KHÔNG log ở đây — tần suất cao (mỗi lần di chuột).
    // Điểm cần chứng minh: mở `redis-cli monitor` sẽ không thấy gì xuất hiện
    // khi di chuột, khác hẳn với việc vẽ/kéo/tô màu (đi qua Stream).
  }
}

(async () => {
  const sessionStream = await h3Server.sessionStream("/wt");
  const sessionReader = sessionStream.getReader();

  while (true) {
    const { done, value: session } = await sessionReader.read();
    if (done) break;

    await session.ready;
    console.log("client connected");

    handleDatagrams(session);

    const uniReader = session.incomingUnidirectionalStreams.getReader();
    (async () => {
      while (true) {
        const { done, value: s } = await uniReader.read();
        if (done) break;
        handleWriteStream(s);
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
