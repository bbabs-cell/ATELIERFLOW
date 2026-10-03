import type { Metadata } from "next";
import { GalleryView } from "@/features/gallery/GalleryView";

export const metadata: Metadata = {
  title: "Galerie",
  description: "Idées de modèles à montrer aux clients.",
};

export default function GaleriePage() {
  return <GalleryView />;
}
