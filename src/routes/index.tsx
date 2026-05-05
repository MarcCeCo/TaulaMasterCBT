import { createFileRoute } from "@tanstack/react-router";
import { TaulaMasterMain } from "@/components/cbt/TaulaMasterMain";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CBT · TaulaMaster" },
      { name: "description", content: "Gestió d'actius BIM i paràmetres tècnics segons GuBIMClass" },
    ],
  }),
});

function Index() {
  return (
    <>
      <TaulaMasterMain />
      <Toaster richColors position="top-right" />
    </>
  );
}
