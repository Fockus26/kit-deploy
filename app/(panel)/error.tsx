"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { digestOf } from "@/components/states/digest";
import { StatusScreen } from "@/components/states/status-screen";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * HANDOFF §5b · 500 inside the shell. `digest` is Next's id of the server error: it is what
 * matches this screen to the line in the panel's logs (the message itself never reaches the
 * browser). Not shown when the error came from the browser and has none.
 */
export default function PanelError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = digestOf(error);
  return (
    <StatusScreen
      code={digest ? `Petición ${digest}` : "500"}
      title="Algo falló en el panel"
      actions={
        <>
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden="true" />
            Reintentar
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Volver a Inicio
          </Link>
        </>
      }
    >
      Los sitios siguen sirviendo: no dependen del panel.
      {digest ? " Si se repite, busca ese id en los logs del panel." : ""}
    </StatusScreen>
  );
}
