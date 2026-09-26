"use client";

import { DEVICE_IDS, DEVICES, suggestDevice, type DeviceId } from "@/engine/devices";
import { cn } from "@/lib/utils";
import type { Background } from "@/schema/project";
import { useProjectStore } from "@/store/project-store";
import { ColorField, NumberField, Section } from "./fields";
import { maxPaddingPx, paddingToPx, pxToPadding } from "./units";

export function StylePanel() {
  const style = useProjectStore((s) => s.project?.style);
  const canvas = useProjectStore((s) => s.project?.canvas);
  const firstAsset = useProjectStore((s) => {
    const clip = s.project?.videoTracks[0]?.clips[0];
    return clip ? s.project!.assets[clip.assetId] : undefined;
  });
  const updateStyle = useProjectStore((s) => s.updateStyle);
  const setBackground = useProjectStore((s) => s.setBackground);
  if (!style || !canvas) return null;

  const bg = style.background;

  return (
    <div className="space-y-8">
      <Section title="Background">
        <div role="radiogroup" aria-label="Background type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["gradient", "solid"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={bg.type === type}
              onClick={() => setBackground(convertBackground(bg, type))}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring",
                bg.type === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {type}
            </button>
          ))}
        </div>
        {bg.type === "solid" && (
          <ColorField
            label="Color"
            value={bg.color}
            onChange={(color) =>
              updateStyle((s) => void (s.background = { type: "solid", color }), { coalesce: "solid-color" })
            }
          />
        )}
        {bg.type === "gradient" && (
          <>
            {bg.stops.map((stop, i) => (
              <ColorField
                key={i}
                label={`Color ${i + 1}`}
                value={stop.color}
                onChange={(color) =>
                  updateStyle(
                    (s) => {
                      if (s.background.type === "gradient") s.background.stops[i]!.color = color;
                    },
                    { coalesce: `gradient-color-${i}` },
                  )
                }
              />
            ))}
            <NumberField
              label="Angle"
              value={bg.angle}
              min={0}
              max={360}
              unit="°"
              onChange={(v) =>
                updateStyle(
                  (s) => {
                    if (s.background.type === "gradient") s.background.angle = v;
                  },
                  { coalesce: "gradient-angle" },
                )
              }
            />
          </>
        )}
      </Section>

      <DeviceSection
        device={style.device}
        suggested={firstAsset?.width && firstAsset.height ? suggestDevice(firstAsset.width / firstAsset.height) : null}
        onChange={(device) => updateStyle((s) => void (s.device = device))}
      />

      <Section title="Layout">
        <NumberField
          label="Padding"
          value={paddingToPx(style.padding, canvas)}
          min={0}
          max={Math.round(maxPaddingPx(canvas) * 0.6)}
          inputMax={maxPaddingPx(canvas)}
          unit="px"
          onChange={(v) => updateStyle((s) => void (s.padding = pxToPadding(v, canvas)), { coalesce: "padding" })}
        />
        {/* A device frame sets its own screen corners. */}
        {!style.device && (
          <NumberField
            label="Corner radius"
            value={style.cornerRadius}
            min={0}
            max={120}
            inputMax={1000}
            unit="px"
            onChange={(v) => updateStyle((s) => void (s.cornerRadius = v), { coalesce: "cornerRadius" })}
          />
        )}
      </Section>

      <Section title="Zoom">
        <NumberField
          label="Background blur"
          value={style.zoomBackgroundBlur}
          min={0}
          max={40}
          inputMax={200}
          unit="px"
          onChange={(v) => updateStyle((s) => void (s.zoomBackgroundBlur = v), { coalesce: "zoomBackgroundBlur" })}
        />
      </Section>

      <Section title="Shadow">
        <NumberField
          label="Blur"
          value={style.shadow.blur}
          min={0}
          max={200}
          inputMax={1000}
          unit="px"
          onChange={(v) => updateStyle((s) => void (s.shadow.blur = v), { coalesce: "shadow.blur" })}
        />
        <NumberField
          label="Offset"
          value={style.shadow.offsetY}
          min={0}
          max={100}
          inputMin={-500}
          inputMax={500}
          unit="px"
          onChange={(v) => updateStyle((s) => void (s.shadow.offsetY = v), { coalesce: "shadow.offsetY" })}
        />
        <NumberField
          label="Opacity"
          value={Math.round(style.shadow.opacity * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => updateStyle((s) => void (s.shadow.opacity = v / 100), { coalesce: "shadow.opacity" })}
        />
      </Section>
    </div>
  );
}

function DeviceSection({
  device,
  suggested,
  onChange,
}: {
  device: { frameId: string; color: string } | null;
  suggested: DeviceId | null;
  onChange: (device: { frameId: string; color: string } | null) => void;
}) {
  const current = device ? DEVICES[device.frameId as DeviceId] : null;
  return (
    <Section title="Device frame">
      <div role="radiogroup" aria-label="Device frame" className="grid grid-cols-3 gap-1">
        {([null, ...DEVICE_IDS] as (DeviceId | null)[]).map((id) => {
          const checked = (device?.frameId ?? null) === id;
          const label = id ? DEVICES[id].name : "None";
          return (
            <button
              key={id ?? "none"}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(id ? { frameId: id, color: DEVICES[id].colors[0]!.id } : null)}
              className={cn(
                "relative rounded-md border px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {label}
              {id && id === suggested && (
                <span className="absolute -top-1.5 -right-1 rounded bg-sky-600 px-1 text-[9px] text-white">
                  suggested
                </span>
              )}
            </button>
          );
        })}
      </div>
      {current && device && (
        <div role="radiogroup" aria-label="Device color" className="flex flex-wrap gap-2">
          {current.colors.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={device.color === c.id}
              aria-label={c.name}
              title={c.name}
              onClick={() => onChange({ frameId: device.frameId, color: c.id })}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
                device.color === c.id ? "ring-2 ring-foreground" : "ring-1 ring-border",
              )}
              style={{ background: c.body }}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function convertBackground(bg: Background, type: "solid" | "gradient"): Background {
  if (bg.type === type) return bg;
  const base = bg.type === "solid" ? bg.color : bg.type === "gradient" ? bg.stops[0]!.color : "#4f46e5";
  return type === "solid"
    ? { type: "solid", color: base }
    : { type: "gradient", angle: 135, stops: [{ color: base, at: 0 }, { color: "#0a0a0a", at: 1 }] };
}

