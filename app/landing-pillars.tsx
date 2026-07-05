"use client";

import { useRef, useState } from "react";

export type Pillar = {
  title: string;
  body: string;
  color: string;
  icon: string;
};

const MAX_TILT = 24;

/** Strongest rotation near edges/corners; barely moves at centre. */
function edgeTilt(rect: DOMRect, clientX: number, clientY: number) {
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  const px = nx - 0.5;
  const py = ny - 0.5;

  const dist = Math.min(Math.hypot(px, py) / 0.707, 1);
  const edge = dist ** 2.1;

  const rotateY = px * MAX_TILT * (0.25 + edge * 2.4);
  const rotateX = -py * MAX_TILT * (0.25 + edge * 2.4);
  const lift = 4 + edge * 18;

  return { rotateX, rotateY, lift, glareX: nx * 100, glareY: ny * 100, edge };
}

function PillarCard({ pillar, index }: { pillar: Pillar; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({
    rotateX: 0,
    rotateY: 0,
    lift: 0,
    glareX: 50,
    glareY: 50,
    edge: 0,
  });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const active = hovered || focused;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    setTilt(edgeTilt(el.getBoundingClientRect(), e.clientX, e.clientY));
  };

  const resetTilt = () =>
    setTilt({ rotateX: 0, rotateY: 0, lift: 0, glareX: 50, glareY: 50, edge: 0 });

  return (
    <div className="pillar-tilt-scene animate-in" style={{ animationDelay: `${index * 0.12}s` }}>
      <div
        ref={cardRef}
        tabIndex={0}
        className="pillar-card outline-none"
        style={{
          transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) translateZ(${tilt.lift}px) translateY(${active ? -4 : 0}px)`,
          transition: active
            ? "transform 0.06s ease-out, box-shadow 0.2s ease"
            : "transform 0.55s cubic-bezier(0.34, 1.35, 0.64, 1), box-shadow 0.35s ease",
          boxShadow: active
            ? `${-tilt.rotateY * 0.6}px ${12 + tilt.rotateX * 0.4}px ${32 + tilt.edge * 24}px ${pillar.color}28, 0 8px 24px rgba(28, 25, 21, 0.1)`
            : undefined,
        }}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          resetTilt();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          resetTilt();
        }}
      >
        {/* Cursor-following glare — reads as light catching the lifted edge */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
          style={{
            opacity: active ? 0.55 + tilt.edge * 0.35 : 0,
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.55) 0%, transparent 52%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
          style={{
            opacity: active ? tilt.edge * 0.45 : 0,
            background: `radial-gradient(ellipse 80% 60% at ${tilt.glareX}% ${tilt.glareY}%, ${pillar.color}22, transparent 70%)`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-px rounded-t-2xl transition-all duration-500"
          style={{
            background: pillar.color,
            opacity: active ? 0.9 : 0.35,
            boxShadow: active ? `0 0 20px ${pillar.color}66` : "none",
          }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-300"
            style={{
              background: `${pillar.color}18`,
              color: pillar.color,
              transform: active ? "scale(1.08) rotate(-4deg)" : "scale(1)",
            }}
          >
            {pillar.icon}
          </div>
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-widest transition-colors duration-300"
            style={{ color: active ? pillar.color : "var(--muted)" }}
          >
            0{index + 1}
          </span>
        </div>
        <div
          className="relative mt-4 h-1 rounded-full transition-all duration-500 ease-out"
          style={{
            width: active ? "100%" : "2.5rem",
            background: pillar.color,
          }}
        />
        <h2 className="relative mt-4 font-sans text-lg font-bold">{pillar.title}</h2>
        <p
          className="relative mt-2 font-mono text-[12px] leading-relaxed transition-colors duration-300"
          style={{ color: active ? "var(--foreground)" : "var(--muted)" }}
        >
          {pillar.body}
        </p>
        <div
          className="relative mt-4 overflow-hidden font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-300"
          style={{
            color: pillar.color,
            maxHeight: active ? 24 : 0,
            opacity: active ? 1 : 0,
          }}
        >
          {index === 0 && "→ exact match · mark paid"}
          {index === 1 && "→ gross payment + fee expense"}
          {index === 2 && "→ review queue · no guess"}
        </div>
      </div>
    </div>
  );
}

export default function LandingPillars({ pillars }: { pillars: Pillar[] }) {
  return (
    <div className="mt-16 grid gap-4 md:grid-cols-3">
      {pillars.map((p, i) => (
        <PillarCard key={p.title} pillar={p} index={i} />
      ))}
    </div>
  );
}
