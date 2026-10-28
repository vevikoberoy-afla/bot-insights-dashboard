import { createFileRoute } from "@tanstack/react-router";
import { ConciergeWidget } from "@/components/concierge/widget";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SIEXY · Concierge" },
      {
        name: "description",
        content:
          "SIEXY concierge — product discovery, order support and a considered returns experience.",
      },
      { property: "og:title", content: "SIEXY · Concierge" },
      {
        property: "og:description",
        content: "A considered product and returns concierge experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <main className="plain-page">
      <ConciergeWidget />
    </main>
  ),
});
