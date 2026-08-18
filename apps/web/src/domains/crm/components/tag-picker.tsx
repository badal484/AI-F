"use client";

import { useQuery } from "@tanstack/react-query";
import { listTags } from "@/domains/crm/tags/actions";
import { TAGS_KEY } from "@/domains/crm/components/tags-manager";
import { cn } from "@/lib/utils";

export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: tags } = useQuery({
    queryKey: TAGS_KEY,
    queryFn: async () => {
      const result = await listTags();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  if (!tags || tags.length === 0) {
    return <p className="text-sm text-muted-foreground">No tags yet — create some on the Tags page.</p>;
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = value.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              selected ? "border-transparent text-white" : "text-muted-foreground hover:text-foreground",
            )}
            style={selected ? { backgroundColor: tag.color } : undefined}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
