"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { format, subDays, subHours } from "date-fns";
import { Button } from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const DATE_FORMAT = "yyyy-MM-dd";

function toInputDate(d: Date): string {
  return format(d, DATE_FORMAT);
}

type PresetKey = "24h" | "7d" | "30d" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [activePreset, setActivePreset] = React.useState<PresetKey>("custom");
  const [from, setFrom] = React.useState(value?.from ?? "");
  const [to, setTo] = React.useState(value?.to ?? "");

  React.useEffect(() => {
    if (value) {
      setFrom(value.from);
      setTo(value.to);
    }
  }, [value]);

  const applyPreset = (key: PresetKey) => {
    setActivePreset(key);
    const now = new Date();
    let start: Date;
    switch (key) {
      case "24h":
        start = subHours(now, 24);
        break;
      case "7d":
        start = subDays(now, 7);
        break;
      case "30d":
        start = subDays(now, 30);
        break;
      default:
        return;
    }
    const range = { from: toInputDate(start), to: toInputDate(now) };
    setFrom(range.from);
    setTo(range.to);
    onChange(range);
  };

  const handleApply = () => {
    if (from && to) {
      onChange({ from, to });
    }
  };

  const displayLabel =
    from && to ? `${from} — ${to}` : "Select date range";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !from && !to && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="mb-3 flex gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={activePreset === p.key ? "default" : "outline"}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setActivePreset("custom");
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setActivePreset("custom");
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>
        {activePreset === "custom" && (
          <Button size="sm" className="mt-3 w-full" onClick={handleApply}>
            Apply
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { DateRangePicker };
export type { DateRangePickerProps, DateRange };
