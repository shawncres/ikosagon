"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

type RingGlowProps = {
  size?: number;
  className?: string;
};

type Particle = {
  angle: number;
  radius: number;
  angularSpeed: number;
  radialSpeed: number;
  size: number;
  opacity: number;
  trail: { x: number; y: number }[];
};

const SEGMENTS = 48;
const ACCENT = { r: 43, g: 255, b: 232 };

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createParticle(outerRadius: number): Particle {
  return {
    angle: Math.random() * Math.PI * 2,
    radius: outerRadius * (0.92 + Math.random() * 0.08),
    angularSpeed: 0.0012 + Math.random() * 0.0015,
    radialSpeed: 0.032 + Math.random() * 0.024,
    size: 1.4 + Math.random() * 1.6,
    opacity: 0.75 + Math.random() * 0.25,
    trail: [],
  };
}

function segmentIndex(angle: number) {
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((normalized / (Math.PI * 2)) * SEGMENTS) % SEGMENTS;
}

function StaticRing({ size, className }: RingGlowProps) {
  return (
    <div
      aria-hidden
      className={`relative rounded-full border-2 border-accent/90 ring-glow ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-[-42%] rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute inset-[12%] rounded-full bg-background/70 blur-md" />
    </div>
  );
}

function AnimatedRing({ size = 180, className = "" }: RingGlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmentsRef = useRef<number[]>(Array.from({ length: SEGMENTS }, () => 0));
  const particlesRef = useRef<Particle[]>([]);
  const lastSpawnRef = useRef(0);
  const canvasSize = size * 2.6;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasScale = 2.6;
    const canvasSize = size * canvasScale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const center = canvasSize / 2;
    const ringRadius = size / 2 - 5;
    const outerRadius = ringRadius * 2.2;
    const strokeWidth = 2.5;
    const segmentAngle = (Math.PI * 2) / SEGMENTS;

    particlesRef.current = Array.from({ length: 7 }, () => createParticle(outerRadius));
    lastSpawnRef.current = performance.now();

    let frameId = 0;
    let lastTime = performance.now();

    const flashRing = (angle: number) => {
      const segments = segmentsRef.current;
      const idx = segmentIndex(angle);
      const intensity = 0.75 + Math.random() * 0.25;

      segments[idx] = Math.max(segments[idx], intensity);
      segments[(idx + 1) % SEGMENTS] = Math.max(segments[(idx + 1) % SEGMENTS], intensity * 0.5);
      segments[(idx - 1 + SEGMENTS) % SEGMENTS] = Math.max(segments[(idx - 1 + SEGMENTS) % SEGMENTS], intensity * 0.5);

      if (Math.random() > 0.35) {
        const randomIdx = Math.floor(Math.random() * SEGMENTS);
        segments[randomIdx] = Math.max(segments[randomIdx], 0.15 + Math.random() * 0.3);
      }
    };

    const drawRing = () => {
      const segments = segmentsRef.current;

      ctx.beginPath();
      ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, 0.3)`;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();

      for (let i = 0; i < SEGMENTS; i++) {
        const brightness = segments[i];
        if (brightness <= 0.02) continue;

        const startAngle = i * segmentAngle - Math.PI / 2;
        const endAngle = startAngle + segmentAngle * 0.9;
        const alpha = 0.3 + brightness * 0.7;

        ctx.beginPath();
        ctx.arc(center, center, ringRadius, startAngle, endAngle);
        ctx.strokeStyle = `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, ${alpha})`;
        ctx.lineWidth = strokeWidth + brightness * 3;
        ctx.shadowBlur = 8 + brightness * 16;
        ctx.shadowColor = `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, ${brightness})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    const animate = (time: number) => {
      const dt = Math.min(time - lastTime, 32);
      lastTime = time;

      ctx.clearRect(0, 0, canvasSize, canvasSize);

      const glowGrad = ctx.createRadialGradient(center, center, ringRadius * 0.3, center, center, ringRadius * 1.55);
      glowGrad.addColorStop(0, "rgba(43, 255, 232, 0.18)");
      glowGrad.addColorStop(0.5, "rgba(43, 255, 232, 0.05)");
      glowGrad.addColorStop(1, "rgba(43, 255, 232, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      const segments = segmentsRef.current;
      for (let i = 0; i < SEGMENTS; i++) {
        segments[i] *= 0.87;
        if (segments[i] < 0.02) segments[i] = 0;
      }

      if (Math.random() < 0.018) {
        const twinkle = Math.floor(Math.random() * SEGMENTS);
        segments[twinkle] = Math.max(segments[twinkle], 0.1 + Math.random() * 0.15);
      }

      if (time - lastSpawnRef.current > 350 + Math.random() * 550 && particlesRef.current.length < 16) {
        particlesRef.current.push(createParticle(outerRadius));
        lastSpawnRef.current = time;
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const vortexBoost = Math.min(3.5, outerRadius / Math.max(particle.radius, ringRadius + 1));

        particle.angle += particle.angularSpeed * vortexBoost * dt;
        particle.radius -= particle.radialSpeed * dt;

        const x = center + Math.cos(particle.angle) * particle.radius;
        const y = center + Math.sin(particle.angle) * particle.radius;

        particle.trail.push({ x, y });
        if (particle.trail.length > 16) particle.trail.shift();

        if (particle.radius <= ringRadius) {
          flashRing(particle.angle);
          particles.splice(i, 1);
          continue;
        }

        if (particle.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
          for (let t = 1; t < particle.trail.length; t++) {
            ctx.lineTo(particle.trail[t].x, particle.trail[t].y);
          }
          ctx.strokeStyle = `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, ${particle.opacity * 0.5})`;
          ctx.lineWidth = particle.size;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, 1)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      drawRing();

      ctx.beginPath();
      ctx.arc(center, center, ringRadius * 0.68, 0, Math.PI * 2);
      const innerGrad = ctx.createRadialGradient(center, center, ringRadius * 0.1, center, center, ringRadius * 0.68);
      innerGrad.addColorStop(0, "rgba(0, 0, 0, 0.94)");
      innerGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      ctx.fillStyle = innerGrad;
      ctx.fill();

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [size]);

  return (
    <div
      aria-hidden
      className={`relative z-10 flex items-center justify-center overflow-visible ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        style={{ width: canvasSize, height: canvasSize }}
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}

export function RingGlow(props: RingGlowProps) {
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  if (prefersReducedMotion) {
    return <StaticRing {...props} />;
  }

  return <AnimatedRing {...props} />;
}
