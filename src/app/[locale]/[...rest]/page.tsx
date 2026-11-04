import { notFound } from "next/navigation";

/** Any unknown path under a locale → the translated not-found page. */
export default function CatchAll() {
  notFound();
}
