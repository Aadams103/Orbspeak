import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectSection } from "./studioTypes";
import { cn } from "@/lib/utils";

export function StudioProjectRail({
  sections,
  activeId,
  onAdd,
}: {
  sections: ProjectSection[];
  activeId?: string;
  onAdd: () => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">Project</p>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2 pb-4">
        {sections.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No document loaded.</p>
        ) : (
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <div
                  className={cn(
                    "rounded-md px-3 py-2 text-sm",
                    section.id === activeId ? "bg-primary/15 text-foreground" : "text-muted-foreground",
                  )}
                >
                  <p className="truncate">{section.title}</p>
                  <p className="text-[11px] text-muted-foreground">Document</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 px-2 text-[11px] text-muted-foreground">Chapter detection is not available yet.</p>
      </ScrollArea>
    </aside>
  );
}
