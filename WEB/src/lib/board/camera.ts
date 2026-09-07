import type Konva from "konva";
import { clamp, lerp } from "./geometry";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/**
 * Zooms `stage` by `factor`, keeping the world point under `pointer` (stage/
 * screen coordinates, e.g. from `stage.getPointerPosition()`) fixed on
 * screen — the standard "zoom to cursor" feel. Mutates the stage directly;
 * this is intentionally imperative rather than React state, since camera
 * updates happen on every wheel tick and re-rendering React for that would
 * be wasteful (Konva already redraws itself when you call batchDraw()).
 */
export function zoomStageAtPointer(stage: Konva.Stage, pointer: { x: number; y: number }, factor: number): void {
    const oldScale = stage.scaleX();
    const newScale = clamp(oldScale * factor, MIN_ZOOM, MAX_ZOOM);

    const worldX = (pointer.x - stage.x()) / oldScale;
    const worldY = (pointer.y - stage.y()) / oldScale;

    stage.scale({ x: newScale, y: newScale });
    stage.position({
        x: pointer.x - worldX * newScale,
        y: pointer.y - worldY * newScale,
    });
    stage.batchDraw();
}

/**
 * Animates `stage` so that the given world coordinate ends up centered in
 * the viewport — this is what a "click a coordinate in chat" feature calls
 * on every client that receives the focus message. Zoom level is left as-is,
 * only pan changes.
 */
export function focusStageOn(stage: Konva.Stage, worldPoint: { x: number; y: number }, durationMs = 300): Promise<void> {
    const scale = stage.scaleX();
    const targetX = stage.width() / 2 - worldPoint.x * scale;
    const targetY = stage.height() / 2 - worldPoint.y * scale;
    const startX = stage.x();
    const startY = stage.y();
    const start = performance.now();

    return new Promise((resolve) => {
        function step(now: number) {
            const t = clamp((now - start) / durationMs, 0, 1);
            stage.position({ x: lerp(startX, targetX, t), y: lerp(startY, targetY, t) });
            stage.batchDraw();
            if (t < 1) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}