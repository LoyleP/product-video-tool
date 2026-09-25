import Link from "next/link";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/app";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{APP_NAME}</p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Turn a raw screen recording into a polished product video.
      </h1>
      <p className="max-w-xl text-lg text-pretty text-muted-foreground">
        Backgrounds, device frames, smooth zooms, text and captions. Everything renders and exports in your
        browser. Nothing gets uploaded.
      </p>
      <Button asChild size="lg">
        <Link href="/editor">Open the editor</Link>
      </Button>
    </main>
  );
}
