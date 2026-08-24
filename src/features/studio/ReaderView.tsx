import { Button } from "@/components/ui/button";
import { Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  sentences: string[];
  activeIndex: number | null;
  speaking: boolean;
  paused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function ReaderView({
  title,
  sentences,
  activeIndex,
  speaking,
  paused,
  onPlay,
  onPause,
  onResume,
  onStop,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex gap-2">
          {!speaking ? (
            <Button onClick={onPlay}>
              <Play className="h-4 w-4" />
              Read aloud
            </Button>
          ) : paused ? (
            <Button onClick={onResume}>
              <Play className="h-4 w-4" />
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={onPause}>
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}
          <Button variant="outline" onClick={onStop} disabled={!speaking}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>
      <div className="rounded-lg border bg-background p-6 leading-8 text-base">
        {sentences.map((sentence, index) => (
          <span
            key={`${index}-${sentence.slice(0, 12)}`}
            className={cn(
              "rounded px-0.5 transition-colors",
              activeIndex === index && "bg-primary/20 text-foreground",
            )}
          >
            {sentence}{" "}
          </span>
        ))}
      </div>
    </div>
  );
}
