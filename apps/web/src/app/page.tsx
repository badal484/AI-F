import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight">
        AI assistants for local businesses
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Answer FAQs, capture leads, and book appointments over WhatsApp and web chat.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/signup" />}>Get started</Button>
        <Button render={<Link href="/login" />} variant="outline">
          Sign in
        </Button>
      </div>
    </main>
  );
}
