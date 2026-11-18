import Link from "next/link";
import { StatusScreen } from "@/components/states/status-screen";
import { buttonVariants } from "@/components/ui/button";

/** HANDOFF §5b · the 404 card (copy of the handoff). */
export function NotFoundCard() {
  return (
    <StatusScreen
      code="404"
      title="Esta página no existe"
      actions={
        <Link href="/" className={buttonVariants({ variant: "default" })}>
          Volver a Inicio
        </Link>
      }
    >
      Puede que el proyecto se haya renombrado o borrado.
    </StatusScreen>
  );
}
