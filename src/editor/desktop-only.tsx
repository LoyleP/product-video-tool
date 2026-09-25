import Link from "next/link";
import { MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DesktopOnly() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <MonitorIcon className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Use a desktop browser</h1>
      <p className="max-w-sm text-pretty text-muted-foreground">
        The editor needs a mouse or trackpad and a larger screen. Open this page in Chrome, Edge, Safari or Firefox
        on your computer.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
