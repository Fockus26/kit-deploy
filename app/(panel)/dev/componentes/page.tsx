import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "Componentes", robots: { index: false } };

/** Dev only: the gallery of components/kit for screenshots and axe. In production it is a 404. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
