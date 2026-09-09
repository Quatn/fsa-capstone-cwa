import type { ElementType, Op } from "@/types/board";
import { parseOp } from "@/types/board";

export type OpHandler = (op: Op) => void;
export type DatagramHandler = (payload: unknown) => void;

/** Shape of one Redis hash entry as returned by the server's GET_STATE reply. */
export interface RawStateEntry {
    value: unknown;
    time: [number, string];
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
    }
    return result;
}

async function readAll(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return concatChunks(chunks);
}

function parseStoredField(raw: string): RawStateEntry | null {
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

/**
 * Thin wrapper around the browser WebTransport API, carrying exactly the
 * three channels the HTTP3 server exposes (see /HTTP3/server.ts):
 *  - unidirectional streams for reliable, CRDT-merged field ops
 *  - one bidirectional stream per GET_STATE request (which also declares
 *    which room this session belongs to — see loadState below)
 *  - datagrams for cursor/draft broadcasts (no Redis, no ordering guarantee)
 *
 * Deliberately has no React/Konva knowledge — `useBoardTransport` is the
 * hook that adapts this to React state.
 */
export class BoardTransport {
    readonly clientId: string = crypto.randomUUID().slice(0, 8);

    private transport: WebTransport | null = null;
    private readonly opHandlers = new Set<OpHandler>();
    private readonly datagramHandlers = new Set<DatagramHandler>();

    async connect(url: string, certHashBase64: string): Promise<void> {
        const transport = new WebTransport(url, {
            serverCertificateHashes: [
                {
                    algorithm: "sha-256",
                    value: Uint8Array.from(atob(certHashBase64), (c) => c.charCodeAt(0)),
                },
            ],
        });
        await transport.ready;
        this.transport = transport;

        this.listenForPushedOps();
        this.listenForDatagrams();
    }

    onOp(handler: OpHandler): () => void {
        this.opHandlers.add(handler);
        return () => this.opHandlers.delete(handler);
    }

    onDatagram(handler: DatagramHandler): () => void {
        this.datagramHandlers.add(handler);
        return () => this.datagramHandlers.delete(handler);
    }

    /** `type` is omitted for the one field that isn't tied to an element type: "deleted". */
    async sendOp(elementId: string, field: string, value: unknown, type?: ElementType): Promise<void> {
        if (!this.transport) throw new Error("BoardTransport: not connected");
        const op =
            field === "deleted"
                ? { elementId, field, value, time: [Date.now(), this.clientId] }
                : { elementId, type, field, value, time: [Date.now(), this.clientId] };
        const stream = await this.transport.createUnidirectionalStream();
        const writer = stream.getWriter();
        await writer.write(new TextEncoder().encode(JSON.stringify(op)));
        await writer.close();
    }

    async sendDatagram(payload: unknown): Promise<void> {
        if (!this.transport) throw new Error("BoardTransport: not connected");
        const writer = this.transport.datagrams.writable.getWriter();
        try {
            await writer.write(new TextEncoder().encode(JSON.stringify(payload)));
        } finally {
            writer.releaseLock();
        }
    }

    /**
     * One round trip over a fresh bidirectional stream. Doubles as both
     * "give me this room's current state" AND "put this session in that
     * room" — the server does both from the same request (see
     * `handleReadStream` in server.ts) since there's no reliable way to pass
     * a dynamic roomId through the WebTransport connection URL itself.
     * Safe to call again later for the same room (e.g. a manual resync) —
     * joining a room you're already in is a no-op server-side.
     */
    async loadState(roomId: string): Promise<Record<string, RawStateEntry>> {
        if (!this.transport) throw new Error("BoardTransport: not connected");
        const stream = await this.transport.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        await writer.write(new TextEncoder().encode(JSON.stringify({ cmd: "GET_STATE", roomId })));
        const bytes = await readAll(stream.readable as ReadableStream<Uint8Array>);
        await writer.close();

        const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>;
        const result: Record<string, RawStateEntry> = {};
        for (const [hashField, fieldDataRaw] of Object.entries(raw)) {
            const parsed = parseStoredField(fieldDataRaw);
            if (parsed) result[hashField] = parsed;
        }
        return result;
    }

    private listenForPushedOps(): void {
        if (!this.transport) return;
        const transport = this.transport;
        (async () => {
            const reader = transport.incomingUnidirectionalStreams.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const bytes = await readAll(value as ReadableStream<Uint8Array>);
                let raw: unknown;
                try {
                    raw = JSON.parse(new TextDecoder().decode(bytes));
                } catch {
                    continue;
                }
                const op = parseOp(raw);
                if (op) this.opHandlers.forEach((h) => h(op));
            }
        })().catch((err) => console.error("BoardTransport: push-stream loop error", err));
    }

    private listenForDatagrams(): void {
        if (!this.transport) return;
        const transport = this.transport;
        (async () => {
            const reader = transport.datagrams.readable.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                try {
                    const payload = JSON.parse(new TextDecoder().decode(value));
                    this.datagramHandlers.forEach((h) => h(payload));
                } catch {
                    // rác/mất gói — bỏ qua, datagram vốn không đảm bảo tin cậy
                }
            }
        })().catch((err) => console.error("BoardTransport: datagram loop error", err));
    }
}