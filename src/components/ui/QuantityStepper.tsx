"use client";

import { Minus, Plus } from "lucide-react";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}

export function QuantityStepper({ value, onChange, label, min = 1, max = 20 }: QuantityStepperProps) {
  return (
    <div className="stepper" role="group" aria-label={`Jumlah ${label}`}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Kurangi">
        <Minus aria-hidden="true" size={16} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Tambah">
        <Plus aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
