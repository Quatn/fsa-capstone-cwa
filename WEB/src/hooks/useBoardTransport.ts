"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { BoardElement, ElementType, Op } from "@/types/board";
import { BoardTransport, type DatagramHandler } from "@/lib/board/webtransportClient";

export type BoardElementsById = Record<string, BoardElement>;
export type ConnectionState = "connecting" | "connected" | "error";
export type OpHandler = (op: Op) => void;

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
    /** Raw incoming ops, for anything that needs more than the merged `elements` state (e.g. clearing a remote draft when its owner commits). */
    onOp: (handler: OpHandler) => () => void;
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
    const datagramHandlersRef = useRef<Set<DatagramHandler>>(new Set());
    const opHandlersRef = useRef<Set<OpHandler>>(new Set());
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
            if (cancelled) return;
            applyOp(op);
            opHandlersRef.current.forEach((h) => h(op)); // forward cho mọi listener đã/sẽ đăng ký
        });
        const unsubscribeDatagram = transport.onDatagram((payload) => {
            if (!cancelled) datagramHandlersRef.current.forEach((h) => h(payload));
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
            unsubscribeDatagram();
            transportRef.current = null;
        };
    }, [url, certHashBase64, applyOp]);

    const onDatagram = useCallback((handler: DatagramHandler) => {
        datagramHandlersRef.current.add(handler);
        return () => { datagramHandlersRef.current.delete(handler); };
    }, []);

    const onOp = useCallback((handler: OpHandler) => {
        opHandlersRef.current.add(handler);
        return () => { opHandlersRef.current.delete(handler); };
    }, []);

    const sendOp = useCallback((elementId: string, field: string, value: unknown, type?: ElementType) => {
        transportRef.current?.sendOp(elementId, field, value, type).catch((err) => console.error("sendOp failed", err));
    }, []);

    const sendDatagram = useCallback((payload: unknown) => {
        transportRef.current?.sendDatagram(payload).catch(() => { });
    }, []);
    // sau khi người dùng đã tương tác, tức là chắc chắn sau khi mount xong.

    return { elements, setElements, sendOp, sendDatagram, onDatagram, onOp, connectionState, clientId };
}