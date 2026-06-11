"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { scoreColor } from "@/lib/format";

// ---------- Button ----------
type ButtonVariant = "primary" | "amber" | "ghost" | "outline" | "outlineLight";
export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50",
    amber:
      "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50",
    ghost:
      "bg-transparent text-brand-800 hover:bg-brand-50 disabled:opacity-50",
    outline:
      "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 disabled:opacity-50",
    outlineLight:
      "border border-brand-300 bg-transparent text-white hover:bg-brand-700 disabled:opacity-50",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-body-sm font-semibold transition-colors disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------- Card ----------
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white shadow-card",
        className,
      )}
      {...props}
    />
  );
}

// ---------- Badge / Pill ----------
export function Pill({
  color,
  className,
  children,
}: {
  color?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold",
        className,
      )}
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
    >
      {children}
    </span>
  );
}

// ---------- ScoreBadge (círculo) ----------
export function ScoreBadge({
  score,
  size = 36,
}: {
  score: number | null;
  size?: number;
}) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.36,
      }}
    >
      {score == null ? "—" : Math.round(score)}
    </span>
  );
}

// ---------- Input ----------
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className,
      )}
      {...props}
    />
  );
}

// ---------- Select (nativo) ----------
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// ---------- Checkbox ----------
export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-body-sm",
        className,
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-neutral-300 accent-amber-500"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

// ---------- Slider (range nativo) ----------
export function Slider({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="range"
      className={cn("w-full accent-amber-500", className)}
      {...props}
    />
  );
}

// ---------- Spinner ----------
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600",
        className,
      )}
    />
  );
}
