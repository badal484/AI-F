"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UpdateLocationHoursInput } from "@aif/shared";
import { listLocationHours, updateLocationHours } from "@/domains/business-core/locations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayState = UpdateLocationHoursInput["days"][number];

export function LocationHoursEditor({ locationId, onSaved }: { locationId: string; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<DayState[] | null>(null);
  // Tracks which locationId `days` was derived from, so the derivation below
  // (a React-endorsed "adjust state during render" pattern, not an effect —
  // see https://react.dev/learn/you-might-not-need-an-effect) re-runs
  // exactly once per fetched result instead of looping.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["location-hours", locationId],
    queryFn: async () => {
      const result = await listLocationHours(locationId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  if (data && loadedFor !== locationId) {
    setLoadedFor(locationId);
    setDays(
      Array.from({ length: 7 }, (_, dayOfWeek) => {
        const existing = data.find((h) => h.dayOfWeek === dayOfWeek);
        return {
          dayOfWeek,
          openTime: existing?.openTime ?? "09:00",
          closeTime: existing?.closeTime ?? "17:00",
          isClosed: existing?.isClosed ?? false,
        };
      }),
    );
  }

  const mutation = useMutation({
    mutationFn: updateLocationHours,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["location-hours", locationId] });
      toast.success("Hours updated");
      onSaved();
    },
    onError: () => toast.error("Something went wrong"),
  });

  function updateDay(index: number, patch: Partial<DayState>) {
    setDays((prev) => prev?.map((d, i) => (i === index ? { ...d, ...patch } : d)) ?? prev);
  }

  if (isLoading || days === null) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-3">
      {days.map((day, index) => (
        <div key={day.dayOfWeek} className="flex items-center gap-3">
          <span className="w-24 text-sm font-medium">{DAY_LABELS[day.dayOfWeek]}</span>
          <Switch checked={!day.isClosed} onCheckedChange={(checked) => updateDay(index, { isClosed: !checked })} />
          {day.isClosed ? (
            <span className="text-sm text-muted-foreground">Closed</span>
          ) : (
            <>
              <Input
                type="time"
                value={day.openTime}
                onChange={(e) => updateDay(index, { openTime: e.target.value })}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                value={day.closeTime}
                onChange={(e) => updateDay(index, { closeTime: e.target.value })}
                className="w-28"
              />
            </>
          )}
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <Button onClick={() => mutation.mutate({ locationId, days })} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save hours"}
        </Button>
      </div>
    </div>
  );
}
