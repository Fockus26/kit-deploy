import { encode } from "uqr";

/**
 * The otpauth:// URI as a QR, drawn here: the TOTP secret never leaves the browser for a QR
 * service. Dark modules on a light square in both themes, with the quiet zone phone cameras need.
 */
export function TotpQr({ uri }: { uri: string }) {
  const { data, size } = encode(uri, { ecc: "M", border: 4 });
  let d = "";
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    });
  });
  return (
    <svg
      role="img"
      aria-label="Código QR para añadir kit-deploy a tu app de autenticación"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-48 rounded-md bg-qr-light"
    >
      <path d={d} className="fill-qr-dark" />
    </svg>
  );
}
