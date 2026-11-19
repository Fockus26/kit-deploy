/**
 * The dashboard's identity for the generated icon and share-card routes (D054). ImageResponse
 * cannot read CSS variables, so the values are copied here from app/globals.css (context/COLORS.md)
 * and tests/unit/brand.test.ts keeps them in step. No brand colour of its own: dark theme + primary.
 */
export const BRAND = {
  /** --background, dark half (#0B0D10). */
  background: "#0b0d10",
  /** --card, dark half (#12151A). */
  surface: "#12151a",
  /** --primary, dark half (#5B9BFF). */
  primary: "#5b9bff",
  /** --foreground, dark half (#E6E8EB). */
  foreground: "#e6e8eb",
  /** --muted-foreground, dark half. */
  muted: "#9aa3ae",
  /** --background, light half (#F6F7F9): theme-color for the light scheme. */
  backgroundLight: "#f6f7f9",
} as const;

/** The mark: an arrow rising from a base line (deploy), on a 32 x 32 grid. */
export const MARK_PATH = "M16 5 L25 16 H19.5 V24 H12.5 V16 H7 Z";
