/**
 * Canvas-based animated particle network background.
 */

import {useReducedMotion} from "framer-motion";
import {useCallback, useEffect, useMemo, useRef} from "react";
import {useUIStore} from "@/store/uiStore";
import type {Particle, ParticleConfig,} from "@/utils/animations/particleEngine";
import {createParticles, DEFAULT_CONFIG, drawParticles, updateParticles,} from "@/utils/animations/particleEngine";

interface ParticleGridProps {
    config?: Partial<ParticleConfig>;
}

export function ParticleGrid({config: configOverride}: ParticleGridProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const rafRef = useRef<number>(0);
    const mouseRef = useRef({x: -1, y: -1});
    const prefersReduced = useReducedMotion();
    const uiScaleRef = useRef(useUIStore.getState().uiScale);
    useEffect(() => useUIStore.subscribe((s) => {
        uiScaleRef.current = s.uiScale;
    }), []);

    const config = useMemo(
        () => ({...DEFAULT_CONFIG, ...configOverride}),
        [configOverride],
    );

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const zoom = uiScaleRef.current || 1;
        mouseRef.current = {x: e.clientX / zoom, y: e.clientY / zoom};
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio, 2);

        function resize() {
            if (!canvas || !ctx) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            particlesRef.current = createParticles(w, h, config.count, config.speed);
        }

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("mousemove", handleMouseMove, {passive: true});

        // Static rendering for reduced motion
        if (prefersReduced) {
            drawParticles(
                ctx,
                particlesRef.current,
                window.innerWidth,
                window.innerHeight,
                config,
            );
            return () => {
                window.removeEventListener("resize", resize);
                document.removeEventListener("mousemove", handleMouseMove);
            };
        }

        let lastTime = performance.now();

        function loop(now: number) {
            if (!ctx) return;
            const dt = now - lastTime;
            lastTime = now;

            // Skip frame if running too slow
            if (dt > 32) {
                rafRef.current = requestAnimationFrame(loop);
                return;
            }

            const w = window.innerWidth;
            const h = window.innerHeight;

            updateParticles(
                particlesRef.current,
                w,
                h,
                mouseRef.current.x,
                mouseRef.current.y,
                config,
                dt,
            );
            drawParticles(ctx, particlesRef.current, w, h, config);
            rafRef.current = requestAnimationFrame(loop);
        }

        rafRef.current = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener("resize", resize);
            document.removeEventListener("mousemove", handleMouseMove);
        };
    }, [prefersReduced, handleMouseMove, config]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
            }}
        />
    );
}
