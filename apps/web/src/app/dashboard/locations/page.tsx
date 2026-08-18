import type { Metadata } from "next";
import { LocationsManager } from "@/domains/business-core/components/locations-manager";

export const metadata: Metadata = { title: "Locations — AI-F" };

export default function LocationsPage() {
  return <LocationsManager />;
}
