import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { classes } from "./classes";
import "./ui.css";

type Variant = "primary" | "secondary";
type Look = { variant?: Variant; cut?: boolean };

function look(variant: Variant, cut: boolean, className?: string) {
  return classes("pv-button", `pv-button--${variant}`, cut && "pv-cut pv-cut--sm", className);
}

/** Navigation styled as a button. Primary links get the gen 5 cut corner by default. */
export function ButtonLink({ variant = "primary", cut = variant === "primary", className, ...rest }: LinkProps & Look) {
  return <Link className={look(variant, cut, className)} {...rest} />;
}

export function Button({ variant = "secondary", cut = variant === "primary", className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & Look) {
  return <button type={type} className={look(variant, cut, className)} {...rest} />;
}
