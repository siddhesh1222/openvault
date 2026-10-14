import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine Tailwind class names, letting later classes override earlier ones. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
