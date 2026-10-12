import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type Tone = "red" | "cream" | "olive" | "outline";

interface PillOwnProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}

function PillInner({ children, icon }: Pick<PillOwnProps, "children" | "icon">) {
  const label = (
    <span className="pill-label">
      {children}
      {icon ?? <ArrowRight aria-hidden="true" size={18} strokeWidth={2.25} />}
    </span>
  );
  // Sizer menjaga lebar tombol; track berisi dua salinan yang bergeser saat hover.
  return (
    <>
      <span className="pill-sizer">{label}</span>
      <span className="pill-track" aria-hidden="true">
        {label}
        {label}
      </span>
    </>
  );
}

export function PillLink({
  children,
  tone = "red",
  icon,
  className = "",
  ...rest
}: PillOwnProps & ComponentPropsWithoutRef<"a">) {
  return (
    <a className={`pill pill--${tone} ${className}`} {...rest}>
      <PillInner icon={icon}>{children}</PillInner>
    </a>
  );
}

export function PillButton({
  children,
  tone = "red",
  icon,
  className = "",
  type = "button",
  ...rest
}: PillOwnProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button type={type} className={`pill pill--${tone} ${className}`} {...rest}>
      <PillInner icon={icon}>{children}</PillInner>
    </button>
  );
}
