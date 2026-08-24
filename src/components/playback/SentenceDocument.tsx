import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type WordRange = {
  sentenceIndex: number;
  start: number;
  end: number;
};

type Props = {
  sentences: string[];
  activeIndex: number | null;
  className?: string;
  wordRanges?: WordRange[];
  editable?: boolean;
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: () => void;
};

export function SentenceDocument({
  sentences,
  activeIndex,
  className,
  wordRanges: _wordRanges,
  editable,
  value,
  onChange,
  onBlur,
}: Props) {
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (editable) {
    return (
      <textarea
        className={cn(
          "h-full min-h-[24rem] w-full resize-none bg-transparent font-serif text-[17px] leading-8 text-foreground outline-none",
          className,
        )}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        spellCheck={false}
      />
    );
  }

  return (
    <div className={cn("font-serif text-[17px] leading-8 text-foreground", className)}>
      {sentences.map((sentence, index) => (
        <span
          key={`${index}-${sentence.slice(0, 24)}`}
          ref={activeIndex === index ? activeRef : undefined}
          className={cn(
            "rounded-sm px-0.5 transition-colors",
            activeIndex === index && "bg-primary/20 text-foreground shadow-[inset_3px_0_0_0_var(--primary)]",
          )}
        >
          {sentence}{" "}
        </span>
      ))}
    </div>
  );
}
