import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale of app/globals.css (`text-body`, `text-caption`, …) are font sizes: without
 * telling tailwind-merge it takes them for text colors and drops `text-primary-foreground` when
 * both are present (a small primary button lost its text color).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "h1",
            "h2",
            "h3",
            "body",
            "mono",
            "caption",
            "eyebrow",
            "metric",
            "input-touch",
          ],
        },
      ],
    },
  },
});

/** shadcn/ui's class joiner: later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
