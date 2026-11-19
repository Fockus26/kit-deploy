import { ImageResponse } from "next/og";
import { BRAND, MARK_PATH } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BRAND.background,
      }}
    >
      <svg width="180" height="180" viewBox="0 0 32 32" role="img">
        <title>kit-deploy</title>
        <path d={MARK_PATH} fill={BRAND.primary} />
        <rect x="7" y="26" width="18" height="2" rx="1" fill={BRAND.primary} />
      </svg>
    </div>,
    size,
  );
}
