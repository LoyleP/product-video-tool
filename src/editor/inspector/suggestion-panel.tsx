"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format-time";
import { useEditorStore } from "@/store/editor-store";
import { useSuggestionsStore } from "@/store/suggestions-store";
import { acceptSuggestions, dismissSuggestions } from "../suggest/accept";

export function SuggestionPanel() {
  const selection = useEditorStore((s) => s.selection);
  const suggestion = useSuggestionsStore((s) =>
    selection?.kind === "suggestion" ? s.suggestions.find((x) => x.id === selection.id) : undefined,
  );
  const update = useSuggestionsStore((s) => s.update);
  if (!suggestion) return null;

  return (
    <div className="space-y-7">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Suggested zoom</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(suggestion.start)} – {formatTime(suggestion.end)}
        </p>
        <p className="text-xs text-muted-foreground">
          Found from motion in the video. The preview shows it while selected; click the preview to re-aim it.
        </p>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <Label>Scale</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{suggestion.scale.toFixed(1)}×</span>
        </div>
        <Slider
          thumbLabel="Suggested zoom scale"
          min={10}
          max={40}
          step={1}
          value={[Math.round(suggestion.scale * 10)]}
          onValueChange={([v]) => v !== undefined && update(suggestion.id, { scale: v / 10 })}
        />
      </section>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" aria-keyshortcuts="Enter" onClick={() => acceptSuggestions([suggestion.id])}>
          <CheckIcon />
          Accept
        </Button>
        <Button size="sm" variant="outline" aria-keyshortcuts="Delete" onClick={() => dismissSuggestions([suggestion.id])}>
          <XIcon />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
