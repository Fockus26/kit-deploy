import { ImageResponse } from "next/og";
import { BRAND, MARK_PATH } from "@/lib/brand";
import { SHARE_CARD } from "@/lib/brand-copy";

export const alt = SHARE_CARD.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: BRAND.background,
        color: BRAND.foreground,
      }}
    >
      <svg width="128" height="128" viewBox="0 0 32 32" role="img">
        <title>kit-deploy</title>
        <path d={MARK_PATH} fill={BRAND.primary} />
        <rect x="7" y="26" width="18" height="2" rx="1" fill={BRAND.primary} />
      </svg>
      <div style={{ fontSize: 96, fontWeight: 700, marginTop: 40 }}>
        {SHARE_CARD.title}
      </div>
      <div style={{ fontSize: 40, marginTop: 16, color: BRAND.muted }}>
        {SHARE_CARD.subtitle}
      </div>
    </div>,
    size,
  );
}
