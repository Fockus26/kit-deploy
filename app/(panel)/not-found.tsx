import { NotFoundCard } from "@/components/states/not-found-card";

export const metadata = { title: "No existe" };

/** HANDOFF §5b · 404 inside the shell: a `notFound()` called under the panel's layout. */
export default function PanelNotFound() {
  return <NotFoundCard />;
}
