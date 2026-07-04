"use client";

// Stage 4 — the Three.js reconciliation-flow hero.
// Purely additive: driven by the SAME `results` array the dashboard reveals,
// so the flow and the numbers can never disagree. Wrapped in an error
// boundary — if WebGL fails, the section disappears and Stage 3 is untouched.

import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Invoice } from "@/lib/xero/types";
import type { StripeCharge } from "@/lib/stripe/types";
import type { ReconcileResult } from "@/lib/agent/reconcile";

/* ---------------------------------------------------------------- */
/* Palette + layout (world units)                                    */

const TEXT = "#26221b";
const TEXT_DIM = "#958e80";
const ACCENT = "#6c4df6";
const MATCHED = "#0fa36b";
const FEE = "#f59e0b";
const FLAGGED = "#e8553a";

const PAY_X = -8;
const INV_X = 8;
const CARD_W = 3.4;
const CARD_H = 0.85;
const FILL_W = CARD_W - 0.24;
const DOCK_X = INV_X - CARD_W / 2 - 0.38; // sphere docks on the card's left edge
const slotY = (i: number) => 3.4 - i * 1.15;
const TRAIL_OPACITY = 0.28;

const REVIEW_SLOTS = [
  { x: -5.9, y: -4.45 },
  { x: -1.7, y: -4.45 },
];
const EXPENSE_SLOT = { x: 3.7, y: -4.45 };
const LANE_TOP = -3.7;
const LANE_BOTTOM = -5.15;

// Camera framing: fit this world box whatever the container aspect is.
// halfW leaves >1 world unit beyond the invoice cards' pulsed extent so
// nothing can clip the right edge at any aspect ratio.
const FRAME = { cx: 0.7, cy: -0.35, halfW: 10.35, halfH: 5.2 };
const FOV = 42;

const gbp = (pence: number) =>
  (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const gbpPounds = (pounds: number) =>
  pounds.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

/* ---------------------------------------------------------------- */
/* Easing                                                            */

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
const linear = (t: number) => t;

/* ---------------------------------------------------------------- */
/* Canvas-texture labels — large, high-contrast, projector-legible   */

interface LabelLine {
  text: string;
  px: number;
  color?: string;
  mono?: boolean; // default true (Space Mono); false = Space Grotesk
  bold?: boolean;
}

const PX_TO_WORLD = 0.0072;

let fontCache: { mono: string; sans: string } | null = null;
function fonts() {
  if (!fontCache) {
    const css = getComputedStyle(document.documentElement);
    fontCache = {
      mono: css.getPropertyValue("--font-space-mono").trim() || "monospace",
      sans: css.getPropertyValue("--font-space-grotesk").trim() || "sans-serif",
    };
  }
  return fontCache;
}

function makeLabel(
  lines: LabelLine[],
  align: "left" | "center" = "left",
  opacity = 1
): THREE.Sprite {
  const f = fonts();
  const dpr = 2;
  const pad = 10;
  const gap = 8;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d")!;
  const fontFor = (l: LabelLine) =>
    `${l.bold ? 700 : 400} ${l.px}px ${l.mono === false ? f.sans : f.mono}`;

  let maxW = 0;
  for (const l of lines) {
    g.font = fontFor(l);
    maxW = Math.max(maxW, g.measureText(l.text).width);
  }
  const cssW = Math.ceil(maxW + pad * 2);
  const cssH = Math.ceil(
    lines.reduce((a, l) => a + l.px * 1.25, 0) + gap * (lines.length - 1) + pad * 2
  );
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  g.scale(dpr, dpr);
  g.textBaseline = "top";
  let y = pad;
  for (const l of lines) {
    g.font = fontFor(l);
    g.fillStyle = l.color ?? TEXT;
    const x = align === "center" ? (cssW - g.measureText(l.text).width) / 2 : pad;
    g.fillText(l.text, x, y);
    y += l.px * 1.25 + gap;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(cssW * PX_TO_WORLD, cssH * PX_TO_WORLD, 1);
  if (align === "left") sprite.center.set(0, 0.5);
  sprite.renderOrder = 10;
  sprite.userData.baseScale = sprite.scale.clone();
  return sprite;
}

/* ---------------------------------------------------------------- */
/* Small scene helpers                                               */

function disposeDeep(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const withGeo = o as Partial<THREE.Mesh>;
    withGeo.geometry?.dispose();
    const mat = (o as Partial<THREE.Mesh>).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}

// Connector trails are ephemeral by contract: each one is registered on the
// world with a fixed time-to-live and swept by the render loop every frame.
// Their removal never depends on a tween callback running, so no state
// (mid-run reset, replay, cleared tween queue) can orphan a line.
interface TrailHandle {
  line: THREE.Line;
  from: THREE.Vector3;
  bornAt: number;
  ttl: number;
}

function makeTrailLine(parent: THREE.Object3D, from: THREE.Vector3): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), from.clone()]);
  const mat = new THREE.LineBasicMaterial({ color: TEXT, transparent: true, opacity: TRAIL_OPACITY });
  const line = new THREE.Line(geo, mat);
  parent.add(line);
  return line;
}

function setTrailEnd(trail: TrailHandle, end: THREE.Vector3) {
  const pos = trail.line.geometry.getAttribute("position") as THREE.BufferAttribute;
  pos.setXYZ(0, trail.from.x, trail.from.y, trail.from.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
}

function removeTrail(trail: TrailHandle) {
  trail.line.parent?.remove(trail.line);
  trail.line.geometry.dispose();
  (trail.line.material as THREE.Material).dispose();
}

const bezier = (
  out: THREE.Vector3,
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number
) => {
  const u = 1 - t;
  out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z
  );
};

/* ---------------------------------------------------------------- */
/* World build — everything the reset/replay control rebuilds        */

interface PaymentHandle {
  group: THREE.Group;
  sphereMat: THREE.MeshBasicMaterial;
  label: THREE.Sprite;
  baseY: number;
  phase: number;
  busy: boolean;
}

interface InvoiceHandle {
  group: THREE.Group;
  cardMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.LineBasicMaterial;
  fill: THREE.Mesh;
  tick: THREE.Sprite;
  baseY: number;
  phase: number;
}

interface WorldCtx {
  root: THREE.Group;
  payments: PaymentHandle[];
  invoiceById: Map<string, InvoiceHandle>;
  invoices: InvoiceHandle[];
  trails: TrailHandle[];
  reviewCount: number;
  dispose: () => void;
}

function zoneRect(x0: number, x1: number, colorHex: string, title: string): THREE.Group {
  const group = new THREE.Group();
  const pts = [
    new THREE.Vector3(x0, LANE_TOP, 0),
    new THREE.Vector3(x1, LANE_TOP, 0),
    new THREE.Vector3(x1, LANE_BOTTOM, 0),
    new THREE.Vector3(x0, LANE_BOTTOM, 0),
  ];
  const rect = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55 })
  );
  group.add(rect);
  const label = makeLabel([{ text: title, px: 24, color: colorHex, bold: true }], "left", 0.85);
  label.position.set(x0 + 0.15, LANE_TOP - 0.28, 0.05);
  group.add(label);
  return group;
}

function buildWorld(
  scene: THREE.Scene,
  payments: StripeCharge[],
  invoices: Invoice[]
): WorldCtx {
  const root = new THREE.Group();
  scene.add(root);

  // Column headers
  const payHeader = makeLabel(
    [{ text: "STRIPE — INCOMING", px: 26, color: TEXT_DIM, bold: true }],
    "left",
    0.9
  );
  payHeader.position.set(PAY_X - 0.3, 4.35, 0);
  root.add(payHeader);
  const invHeader = makeLabel(
    [{ text: "XERO — OPEN INVOICES", px: 26, color: TEXT_DIM, bold: true }],
    "left",
    0.9
  );
  invHeader.position.set(INV_X - CARD_W / 2, 4.35, 0);
  root.add(invHeader);

  // Lanes
  root.add(zoneRect(-6.6, 1.7, FLAGGED, "REVIEW — NEEDS A HUMAN"));
  root.add(zoneRect(2.7, 9.9, "#d97706", "EXPENSES — STRIPE FEES"));

  // Payment nodes (left)
  const sphereGeo = new THREE.SphereGeometry(0.28, 32, 32);
  const paymentHandles: PaymentHandle[] = payments.map((p, i) => {
    const group = new THREE.Group();
    group.position.set(PAY_X, slotY(i), 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true });
    group.add(new THREE.Mesh(sphereGeo, mat));
    const label = makeLabel([
      { text: p.billing_details.name ?? "Unknown sender", px: 34, bold: true, mono: false },
      {
        text: `${gbp(p.amount)} · ${p.metadata.invoice_number ?? "no ref"}`,
        px: 26,
        color: TEXT_DIM,
      },
    ]);
    label.position.set(0.5, 0, 0.05);
    group.add(label);
    root.add(group);
    return { group, sphereMat: mat, label, baseY: slotY(i), phase: i * 0.9, busy: false };
  });

  // Invoice cards (right)
  const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, 0.12);
  const edgesGeo = new THREE.EdgesGeometry(cardGeo);
  const fillGeo = new THREE.BoxGeometry(FILL_W, 0.14, 0.06);
  const invoiceHandles: InvoiceHandle[] = invoices.map((inv, i) => {
    const group = new THREE.Group();
    group.position.set(INV_X, slotY(i), 0);
    const cardMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    group.add(new THREE.Mesh(cardGeo, cardMat));
    const edgeMat = new THREE.LineBasicMaterial({ color: TEXT, transparent: true, opacity: 0.3 });
    group.add(new THREE.LineSegments(edgesGeo, edgeMat));

    const label = makeLabel(
      [
        { text: `${inv.InvoiceNumber} · ${gbpPounds(inv.Total)}`, px: 30, bold: true },
        { text: inv.Contact.Name, px: 24, color: TEXT_DIM, mono: false },
      ],
      "center"
    );
    label.position.z = 0.2;
    group.add(label);

    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: FLAGGED }));
    fill.position.set(0, -CARD_H / 2 + 0.17, 0.12);
    fill.visible = false;
    group.add(fill);

    const tick = makeLabel([{ text: "✓", px: 44, color: MATCHED, bold: true }], "center");
    tick.position.set(CARD_W / 2 - 0.42, 0, 0.25);
    tick.visible = false;
    group.add(tick);

    root.add(group);
    return { group, cardMat, edgeMat, fill, tick, baseY: slotY(i), phase: i * 0.7 + 0.4 };
  });

  const ctx: WorldCtx = {
    root,
    payments: paymentHandles,
    invoices: invoiceHandles,
    invoiceById: new Map(invoices.map((inv, i) => [inv.InvoiceID, invoiceHandles[i]])),
    trails: [],
    reviewCount: 0,
    dispose: () => {
      ctx.trails.forEach(removeTrail);
      ctx.trails = [];
      scene.remove(root);
      disposeDeep(root);
    },
  };
  return ctx;
}

/* ---------------------------------------------------------------- */
/* The component                                                     */

interface Tween {
  at: number;
  dur: number;
  ease: (t: number) => number;
  apply: (k: number) => void;
  onDone?: () => void;
  done?: boolean;
}

function FlowInner({
  payments,
  invoices,
  results,
}: {
  payments: StripeCharge[];
  invoices: Invoice[];
  results: (ReconcileResult | null)[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const animatedRef = useRef<Set<number>>(new Set());
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.warn("3D flow disabled (WebGL unavailable):", err);
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 100);
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const state = {
      tweens: [] as Tween[],
      ctx: null as WorldCtx | null,
      runStarted: false,
      disposed: false,
    };

    const fit = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      const aspect = w / h;
      camera.aspect = aspect;
      const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const z = Math.max(FRAME.halfH / t, FRAME.halfW / (t * aspect));
      camera.position.set(FRAME.cx, FRAME.cy, z);
      camera.lookAt(FRAME.cx, FRAME.cy, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);

    const addTween = (
      delay: number,
      dur: number,
      ease: (t: number) => number,
      apply: (k: number) => void,
      onDone?: () => void
    ) => {
      state.tweens.push({ at: now() + delay, dur, ease, apply, onDone });
    };

    const fadeSprite = (sprite: THREE.Sprite, to: number, dur: number, delay = 0) => {
      const from = sprite.material.opacity;
      addTween(delay, dur, linear, (k) => {
        sprite.material.opacity = from + (to - from) * k;
      });
    };

    // ttl covers the full travel + a short hold; the sweep in animate() fades
    // the last 0.4s and removes it — guaranteed, tween-independent cleanup.
    const spawnTrail = (from: THREE.Vector3, ttl: number): TrailHandle => {
      const ctx = state.ctx!;
      const trail: TrailHandle = {
        line: makeTrailLine(ctx.root, from),
        from: from.clone(),
        bornAt: now(),
        ttl,
      };
      ctx.trails.push(trail);
      return trail;
    };

    const pulse = (delay: number, dur: number, targets: THREE.Object3D[], amp = 1.14) => {
      addTween(delay, dur, linear, (k) => {
        const s = 1 + Math.abs(Math.sin(k * Math.PI * 2)) * (amp - 1);
        for (const o of targets) o.scale.setScalar(s);
      });
    };

    const popSprite = (sprite: THREE.Sprite, delay: number) => {
      const base = sprite.userData.baseScale as THREE.Vector3;
      addTween(delay, 0.45, easeOutBack, (k) => {
        sprite.visible = true;
        sprite.scale.copy(base).multiplyScalar(Math.max(k, 0.001));
      });
    };

    /* ---- choreography: one routine per decision type ---- */

    const trigger = (i: number, result: ReconcileResult) => {
      const ctx = state.ctx;
      if (!ctx) return;
      state.runStarted = true;
      const p = ctx.payments[i];
      p.busy = true;
      const d = result.decision;
      const from = new THREE.Vector3(PAY_X, p.baseY, 0.3);
      p.group.position.copy(from);
      const root = ctx.root;

      if (d.type === "DUPLICATE") {
        // Recognised (flash) → dissolves in place. Never travels, never writes.
        const cAccent = new THREE.Color(ACCENT);
        const cFlash = new THREE.Color("#26221b");
        addTween(0, 0.55, linear, (k) => {
          p.sphereMat.color.lerpColors(cAccent, cFlash, Math.abs(Math.sin(k * Math.PI * 3)));
        });
        addTween(0.55, 0.6, easeInOut, (k) => {
          p.group.scale.setScalar(1 - 0.65 * k);
          p.sphereMat.opacity = 1 - 0.92 * k;
        });
        fadeSprite(p.label, 0, 0.45, 0.55);
        const dup = makeLabel(
          [{ text: "duplicate · skipped", px: 28, color: TEXT_DIM, bold: true }],
          "left",
          0
        );
        dup.position.set(PAY_X + 0.5, p.baseY, 0.4);
        root.add(dup);
        fadeSprite(dup, 1, 0.4, 0.7);
        return;
      }

      if (d.type === "NO_MATCH") {
        // Heads for the invoice column, finds no target, slows, drifts to review.
        const slot = REVIEW_SLOTS[ctx.reviewCount++ % REVIEW_SLOTS.length];
        const mid = new THREE.Vector3(1.2, p.baseY - 0.5, 0.3);
        const end = new THREE.Vector3(slot.x, slot.y, 0.3);
        const ctrl = new THREE.Vector3(mid.x + 0.6, (mid.y + end.y) / 2 - 0.4, 0.3);
        const trail = spawnTrail(from, 2.3); // travel ends at 1.9s + short hold
        const cAccent = new THREE.Color(ACCENT);
        const cFlag = new THREE.Color(FLAGGED);
        addTween(0, 0.9, easeOut, (k) => {
          p.group.position.lerpVectors(from, mid, k);
          setTrailEnd(trail, p.group.position);
        });
        addTween(1.0, 0.9, easeInOut, (k) => {
          bezier(p.group.position, mid, ctrl, end, k);
          p.sphereMat.color.lerpColors(cAccent, cFlag, k);
          setTrailEnd(trail, p.group.position);
        });
        pulse(1.95, 0.6, [p.group]);
        return;
      }

      // MATCH / FEE_SPLIT / PARTIAL all travel to a real invoice card first.
      const inv = d.invoice ? ctx.invoiceById.get(d.invoice.InvoiceID) : undefined;
      if (!inv) return;
      const dock = new THREE.Vector3(DOCK_X, inv.baseY, 0.3);
      const trail = spawnTrail(from, 1.5); // travel ends at 0.75s + short hold
      // Label ducks out as the node departs so it can never cross an invoice card.
      fadeSprite(p.label, 0, 0.3, 0.15);
      addTween(0, 0.75, easeInOut, (k) => {
        p.group.position.lerpVectors(from, dock, k);
        setTrailEnd(trail, p.group.position);
      });

      if (d.type === "MATCH" || d.type === "FEE_SPLIT") {
        // Snap on: both pulse teal, paid tick pops on the card.
        addTween(0.75, 0.01, linear, () => {
          p.sphereMat.color.set(MATCHED);
          inv.cardMat.color.set(0xe2f6ec);
          inv.edgeMat.color.set(MATCHED);
          inv.edgeMat.opacity = 0.95;
        });
        pulse(0.78, 0.65, [p.group, inv.group], 1.09);
        popSprite(inv.tick, 0.95);

        if (d.type === "FEE_SPLIT" && d.feeAmount) {
          // A smaller amber node peels off mid-flight to the expenses lane.
          const feeGroup = new THREE.Group();
          const feeMat = new THREE.MeshBasicMaterial({ color: FEE, transparent: true });
          feeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), feeMat));
          const feeLabel = makeLabel([
            { text: `fee ${gbpPounds(d.feeAmount)}`, px: 26, color: "#d97706", bold: true },
          ]);
          feeLabel.position.set(0.34, 0, 0.05);
          feeGroup.add(feeLabel);
          const end = new THREE.Vector3(EXPENSE_SLOT.x, EXPENSE_SLOT.y, 0.3);
          let start: THREE.Vector3 | null = null;
          let ctrl: THREE.Vector3 | null = null;
          addTween(0.3, 0.95, easeInOut, (k) => {
            if (!start || !ctrl) {
              start = p.group.position.clone();
              ctrl = new THREE.Vector3(start.x + 1.4, (start.y + end.y) / 2 - 0.8, 0.3);
              feeGroup.position.copy(start);
              root.add(feeGroup);
            }
            bezier(feeGroup.position, start, ctrl, end, k);
          }, () => pulse(0, 0.5, [feeGroup]));
        }
        return;
      }

      // PARTIAL: reaches the invoice, only part-fills it, then drifts to review.
      // The label (faded out at departure, above) returns only once the node
      // has fully settled in the review lane — never while near the card.
      fadeSprite(p.label, 1, 0.4, 2.85);
      const frac = Math.min(d.payment.amount / 100 / (d.invoice?.Total ?? 1), 1);
      addTween(0.85, 0.6, easeInOut, (k) => {
        inv.fill.visible = true;
        const s = Math.max(frac * k, 0.001);
        inv.fill.scale.x = s;
        inv.fill.position.x = -FILL_W / 2 + (FILL_W * s) / 2;
      });
      const slot = REVIEW_SLOTS[ctx.reviewCount++ % REVIEW_SLOTS.length];
      const end = new THREE.Vector3(slot.x, slot.y, 0.3);
      const ctrl = new THREE.Vector3(dock.x - 2.2, (dock.y + end.y) / 2, 0.3);
      const cFlag = new THREE.Color(FLAGGED);
      addTween(1.9, 0.9, easeInOut, (k) => {
        bezier(p.group.position, dock, ctrl, end, k);
        if (k > 0) p.sphereMat.color.lerp(cFlag, Math.min(k * 2, 1));
      });
      pulse(2.85, 0.6, [p.group]);
    };

    /* ---- world lifecycle ---- */

    const resetWorld = () => {
      state.tweens = [];
      state.runStarted = false;
      state.ctx?.dispose();
      state.ctx = buildWorld(scene, payments, invoices);
      animatedRef.current.clear();
    };

    const sync = () => {
      if (state.disposed || !state.ctx) return;
      const rs = resultsRef.current;
      if (rs.every((r) => r === null)) {
        if (animatedRef.current.size > 0) resetWorld();
        return;
      }
      rs.forEach((r, i) => {
        if (r && !animatedRef.current.has(i)) {
          animatedRef.current.add(i);
          trigger(i, r);
        }
      });
    };
    syncRef.current = sync;

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = now();
      for (const tw of state.tweens) {
        if (t < tw.at) continue;
        const k = Math.min(1, (t - tw.at) / tw.dur);
        tw.apply(tw.ease(k));
        if (k >= 1) {
          tw.done = true;
          tw.onDone?.();
        }
      }
      if (state.tweens.some((tw) => tw.done)) {
        state.tweens = state.tweens.filter((tw) => !tw.done);
      }
      const ctx = state.ctx;
      if (ctx) {
        // Trail sweep: every connector fades over its final 0.4s and is removed
        // at end-of-life, regardless of what happened to the tween queue.
        if (ctx.trails.length > 0) {
          let expired = false;
          for (const tr of ctx.trails) {
            const age = t - tr.bornAt;
            if (age >= tr.ttl) {
              removeTrail(tr);
              expired = true;
            } else if (age > tr.ttl - 0.4) {
              (tr.line.material as THREE.LineBasicMaterial).opacity =
                TRAIL_OPACITY * ((tr.ttl - age) / 0.4);
            }
          }
          if (expired) ctx.trails = ctx.trails.filter((tr) => t - tr.bornAt < tr.ttl);
        }
        // Idle float — payments drift gently until the agent picks them up.
        for (const p of ctx.payments) {
          if (!p.busy) p.group.position.y = p.baseY + Math.sin(t * 1.1 + p.phase) * 0.06;
        }
        if (!state.runStarted) {
          for (const inv of ctx.invoices) {
            inv.group.position.y = inv.baseY + Math.sin(t * 0.9 + inv.phase) * 0.035;
          }
        }
      }
      renderer.render(scene, camera);
    };

    // Fonts must be ready before labels are drawn to canvas textures.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      state.ctx = buildWorld(scene, payments, invoices);
      sync(); // catch up if a run started before fonts resolved
      animate();
    });

    if (process.env.NODE_ENV !== "production") {
      // Dev-only inspection hook: lets tests count live connector lines and
      // project node bounds without reaching into module scope.
      (window as unknown as Record<string, unknown>).__flowDebug = () => {
        const lines: string[] = [];
        scene.traverse((o) => {
          if ((o as THREE.Line).isLine && o.type === "Line") {
            const posAttr = (o as THREE.Line).geometry.getAttribute("position");
            lines.push(
              `(${posAttr.getX(0).toFixed(1)},${posAttr.getY(0).toFixed(1)})→(${posAttr
                .getX(1)
                .toFixed(1)},${posAttr.getY(1).toFixed(1)}) op=${(
                (o as THREE.Line).material as THREE.LineBasicMaterial
              ).opacity.toFixed(2)}`
            );
          }
        });
        return { trailLines: lines, registered: state.ctx?.trails.length ?? 0 };
      };
    }

    return () => {
      cancelled = true;
      state.disposed = true;
      syncRef.current = () => {};
      cancelAnimationFrame(raf);
      ro.disconnect();
      state.ctx?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Mount-only: payments/invoices are the seeded demo world and never change identity mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive animations from the same revealed results the dashboard renders.
  useEffect(() => {
    syncRef.current();
  }, [results]);

  if (failed) return null;

  const running = results.some((r) => r !== null);

  return (
    <section className="hidden md:block">
      <div className="flex items-center justify-between border-b border-[var(--ring)] bg-gradient-to-r from-[#faf8f5] to-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#635bff]">
            <span className="h-2 w-2 rounded-full bg-[#635bff]" />
            Stripe
          </span>
          <span className="text-[var(--muted)]">→</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#13b5ea]">
            <span className="h-2 w-2 rounded-full bg-[#13b5ea]" />
            Xero
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          {running ? "Live reconciliation" : "Idle · press Run agent"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative h-[58vh] max-h-[580px] min-h-[420px] w-full overflow-hidden bg-gradient-to-b from-[#faf8f5] to-white"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ring)] bg-[#faf8f5]/80 px-5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Every node follows the agent&apos;s real decision
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[var(--muted)]">
          <LegendDot color={MATCHED} label="matched" />
          <LegendDot color="#d97706" label="fee split" />
          <LegendDot color={FLAGGED} label="flagged" />
          <LegendDot color={TEXT_DIM} label="duplicate" hollow />
        </div>
      </div>
    </section>
  );
}

function LegendDot({ color, label, hollow }: { color: string; label: string; hollow?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={hollow ? { border: `1.5px dashed ${color}` } : { background: color }}
      />
      {label}
    </span>
  );
}

class FlowErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("3D flow disabled:", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ReconcileFlow(props: {
  payments: StripeCharge[];
  invoices: Invoice[];
  results: (ReconcileResult | null)[];
}) {
  return (
    <FlowErrorBoundary>
      <FlowInner {...props} />
    </FlowErrorBoundary>
  );
}
