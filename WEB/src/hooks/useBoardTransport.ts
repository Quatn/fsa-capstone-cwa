"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { BoardElement, ElementType, Op } from "@/types/board";
import { BoardTransport, type DatagramHandler } from "@/lib/board/webtransportClient";

export type BoardElementsById = Record<string, BoardElement>;
export type ConnectionState = "connecting" | "connected" | "error";

interface LoadingElement {
    id: string;
    type?: ElementType;
    deleted: boolean;
    data: Record<string, unknown>;
}

interface UseBoardTransportOptions {
    url: string;
    certHashBase64: string;
}

interface UseBoardTransportResult {
    elements: BoardElementsById;
    /** Exposed directly so the canvas can apply optimistic local updates while dragging/drawing. */
    setElements: Dispatch<SetStateAction<BoardElementsById>>;
    sendOp: (elementId: string, field: string, value: unknown, type?: ElementType) => void;
    sendDatagram: (payload: unknown) => void;
    onDatagram: (handler: DatagramHandler) => () => void;
    connectionState: ConnectionState;
    clientId: string | null;
}

/**
 * Bridges BoardTransport (plain WebTransport wrapper, no React/Konva
 * knowledge) into React state. Mirrors what `index.html`'s `main()` used to
 * do inline: connect, load initial state, apply pushed ops as they arrive.
 */
export function useBoardTransport({ url, certHashBase64 }: UseBoardTransportOptions): UseBoardTransportResult {
    const transportRef = useRef<BoardTransport | null>(null);
    const [elements, setElements] = useState<BoardElementsById>({});
    const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
    const [clientId, setClientId] = useState<string | null>(null);

    const applyOp = useCallback((op: Op) => {
        setElements((prev) => {
            const existing = prev[op.elementId];
            if (op.field === "deleted") {
                if (!existing) return prev; // xoá 1 phần tử ta chưa từng thấy — bỏ qua
                return { ...prev, [op.elementId]: { ...existing, deleted: op.value } };
            }
            const base = existing ?? ({ id: op.elementId, type: op.type, deleted: false, data: {} } as BoardElement);
            const merged = {
                ...base,
                type: op.type,
                data: { ...base.data, [op.field]: op.value },
            } as BoardElement;
            return { ...prev, [op.elementId]: merged };
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        const transport = new BoardTransport();
        transportRef.current = transport;
        setClientId(transport.clientId);

        const unsubscribeOp = transport.onOp((op) => {
            if (!cancelled) applyOp(op);
        });

        (async () => {
            try {
                await transport.connect(url, certHashBase64);
                const raw = await transport.loadState();
                if (cancelled) return;

                const loading: Record<string, LoadingElement> = {};
                for (const [hashField, entry] of Object.entries(raw)) {
                    const sep = hashField.indexOf(":");
                    const id = hashField.slice(0, sep);
                    const field = hashField.slice(sep + 1);
                    const current: LoadingElement = loading[id] ?? { id, deleted: false, data: {} };
                    if (field === "__type") current.type = entry.value as ElementType;
                    else if (field === "deleted") current.deleted = entry.value as boolean;
                    else current.data[field] = entry.value;
                    loading[id] = current;
                }

                const loaded: BoardElementsById = {};
                for (const el of Object.values(loading)) {
                    if (!el.type) continue; // chưa nhận đủ field để biết type — hiếm khi xảy ra, bỏ qua
                    loaded[el.id] = { id: el.id, type: el.type, deleted: el.deleted, data: el.data } as BoardElement;
                }
                setElements(loaded);
                setConnectionState("connected");
            } catch (err) {
                console.error("useBoardTransport: connect/loadState failed", err);
                if (!cancelled) setConnectionState("error");
            }
        })();

        return () => {
            cancelled = true;
            unsubscribeOp();
            transportRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only if the endpoint itself changes
    }, [url, certHashBase64, applyOp]);

    const sendOp = useCallback((elementId: string, field: string, value: unknown, type?: ElementType) => {
        transportRef.current?.sendOp(elementId, field, value, type).catch((err) => console.error("sendOp failed", err));
    }, []);

    const sendDatagram = useCallback((payload: unknown) => {
        transportRef.current?.sendDatagram(payload).catch(() => { });
    }, []);

    const onDatagram = useCallback((handler: DatagramHandler) => {
        const unsubscribe = transportRef.current?.onDatagram(handler);
        return unsubscribe ?? (() => { });
    }, []);

    return { elements, setElements, sendOp, sendDatagram, onDatagram, connectionState, clientId };
}