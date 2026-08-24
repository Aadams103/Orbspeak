import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPronunciationRow, parsePronunciationRows, serializePronunciationRows } from "./pronunciation";

type Props = {
  csv: string;
  onChange: (csv: string) => void;
};

export function PronunciationTable({ csv, onChange }: Props) {
  const rows = parsePronunciationRows(csv);

  const update = (nextRows: typeof rows) => {
    onChange(serializePronunciationRows(nextRows));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Pronunciation</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => update([...rows, createPronunciationRow()])}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No replacements yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                aria-label="Heard"
                placeholder="Heard"
                value={row.heard}
                onChange={(event) => {
                  const next = rows.slice();
                  next[index] = { ...row, heard: event.target.value };
                  update(next);
                }}
              />
              <Input
                aria-label="Said"
                placeholder="Said"
                value={row.said}
                onChange={(event) => {
                  const next = rows.slice();
                  next[index] = { ...row, said: event.target.value };
                  update(next);
                }}
              />
              <Button type="button" size="icon" variant="ghost" aria-label="Delete pronunciation" onClick={() => update(rows.filter((item) => item.id !== row.id))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">Advanced CSV</summary>
        <Textarea
          className="mt-2"
          rows={3}
          value={csv}
          onChange={(event) => onChange(event.target.value)}
          placeholder={"Orbspeak,Orb speak"}
        />
      </details>
    </div>
  );
}
