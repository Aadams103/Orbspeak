import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Mic,
  MicOff,
  Trash2,
  Download,
  Copy,
  Check,
  User,
  Plus,
  ChevronDown,
  Settings,
  Wand2,
  BookOpen,
  Replace,
  ArrowDown,
  Pause,
  Play,
  VolumeX,
  Volume2,
  X,
  GripVertical,
  Maximize2,
  Minimize2,
  Languages,
  Zap,
  Sparkles,
  PenLine,
  Save,
  RotateCcw,
  Edit3,
} from "lucide-react";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  processTranscription,
  SUPPORTED_LANGUAGES,
  type VoiceShortcut,
} from "@/lib/text-processing";
// ProfileLearningStore no longer directly imported - accessed via runtime
import { HelpMeWriteFloatingPanel } from "@/components/HelpMeWriteFloatingPanel";
import { getRuntime, SpeakOrbRuntime } from "@/lib/speakorb-runtime";
import { useSpeakOrbRuntime } from "@/hooks/use-speakorb-runtime";

import TranscriptionSessionORM, {
  type TranscriptionSessionModel,
} from "@/components/data/orm/orm_transcription_session";
import VoiceShortcutORM from "@/components/data/orm/orm_voice_shortcut";
import UserSettingsORM from "@/components/data/orm/orm_user_settings";
import VoiceProfileORM, {
  type VoiceProfileModel,
} from "@/components/data/orm/orm_voice_profile";
import PersonalDictionaryEntryORM, {
  type PersonalDictionaryEntryModel,
  PersonalDictionaryEntryEntryType,
} from "@/components/data/orm/orm_personal_dictionary_entry";
import {
  getProfileStorage,
  type VersionedProfile,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/profile-storage";
import {
  OrbPositionManager,
  type OrbPosition,
} from "@/lib/orb-position-manager";
import { FocusManager } from "@/lib/focus-manager";

export const Route = createFileRoute("/")({
  component: App,
});

// Helper to generate homophones
const HOMOPHONES: Record<string, string[]> = {
  their: ["there", "they're"],
  there: ["their", "they're"],
  "they're": ["their", "there"],
  your: ["you're"],
  "you're": ["your"],
  its: ["it's"],
  "it's": ["its"],
  to: ["too", "two"],
  too: ["to", "two"],
  two: ["to", "too"],
  right: ["write", "rite"],
  write: ["right", "rite"],
  no: ["know"],
  know: ["no"],
  here: ["hear"],
  hear: ["here"],
  wear: ["where", "ware"],
  where: ["wear", "ware"],
  weather: ["whether"],
  whether: ["weather"],
  affect: ["effect"],
  effect: ["affect"],
  accept: ["except"],
  except: ["accept"],
  then: ["than"],
  than: ["then"],
  are: ["our"],
  our: ["are"],
  for: ["four", "fore"],
  four: ["for", "fore"],
  by: ["buy", "bye"],
  buy: ["by", "bye"],
  bye: ["by", "buy"],
  new: ["knew", "gnu"],
  knew: ["new"],
  sea: ["see"],
  see: ["sea"],
  be: ["bee"],
  bee: ["be"],
  peace: ["piece"],
  piece: ["peace"],
  week: ["weak"],
  weak: ["week"],
  meet: ["meat"],
  meat: ["meet"],
  mail: ["male"],
  male: ["mail"],
  sale: ["sail"],
  sail: ["sale"],
  tale: ["tail"],
  tail: ["tale"],
  wait: ["weight"],
  weight: ["wait"],
};

// Orb visual states
type OrbState = "idle" | "listening" | "processing" | "success" | "error";

// Mode types
type DictationMode = "dictation" | "command" | "focus";

// Word component that can be clicked for correction with training support
function ClickableWord({
  word,
  index,
  onCorrect,
  onTrain,
  existingEntry,
}: {
  word: string;
  index: number;
  onCorrect: (index: number, newWord: string) => void;
  onTrain: (
    originalWord: string,
    replacementWord: string,
    alwaysReplace: boolean,
    pronunciationHint: string
  ) => void;
  existingEntry?: PersonalDictionaryEntryModel | null;
}) {
  const [open, setOpen] = useState(false);
  const [showTraining, setShowTraining] = useState(false);
  const [replacementText, setReplacementText] = useState("");
  const [alwaysReplace, setAlwaysReplace] = useState(false);
  const [pronunciationHint, setPronunciationHint] = useState("");

  // Generate correction suggestions based on common speech recognition errors
  const generateSuggestions = (originalWord: string): string[] => {
    const suggestions: string[] = [];
    const lower = originalWord.toLowerCase();

    // Add homophones if available
    if (HOMOPHONES[lower]) {
      suggestions.push(...HOMOPHONES[lower]);
    }

    // Add capitalization variants
    if (originalWord.charAt(0) === originalWord.charAt(0).toLowerCase()) {
      suggestions.push(
        originalWord.charAt(0).toUpperCase() + originalWord.slice(1)
      );
    } else {
      suggestions.push(originalWord.toLowerCase());
    }

    // Add possessive form
    if (!originalWord.endsWith("'s") && !originalWord.endsWith("s'")) {
      suggestions.push(originalWord + "'s");
    }

    // Add plural form
    if (!originalWord.endsWith("s")) {
      suggestions.push(originalWord + "s");
    }

    // Remove duplicates and the original word
    return [...new Set(suggestions)]
      .filter((s) => s.toLowerCase() !== lower)
      .slice(0, 5);
  };

  const suggestions = generateSuggestions(word);

  const handleSelect = (newWord: string) => {
    onCorrect(index, newWord);
    setOpen(false);
  };

  const handleTrainWord = () => {
    if (replacementText.trim()) {
      onTrain(
        word,
        replacementText.trim(),
        alwaysReplace,
        pronunciationHint.trim()
      );
      onCorrect(index, replacementText.trim());
      setOpen(false);
      setShowTraining(false);
      setReplacementText("");
      setAlwaysReplace(false);
      setPronunciationHint("");
    }
  };

  // If the word is just punctuation or whitespace, don't make it clickable
  if (!word.trim() || /^[.,!?;:'"()-]+$/.test(word)) {
    return <span>{word}</span>;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setShowTraining(false);
          setReplacementText("");
          setAlwaysReplace(false);
          setPronunciationHint("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={`cursor-pointer hover:bg-primary/20 hover:text-primary rounded px-0.5 transition-colors inline-block ${
            existingEntry?.is_always_replace
              ? "underline decoration-dotted decoration-primary/50"
              : ""
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setOpen(true);
            }
          }}
        >
          {word}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        {!showTraining ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">
                "{word}"
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowTraining(true)}
              >
                <BookOpen className="h-3 w-3" />
                Train
              </Button>
            </div>

            {existingEntry && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-md text-xs">
                <Badge variant="outline" className="text-xs">
                  Trained
                </Badge>
                <span className="text-muted-foreground">
                  Always replace with "{existingEntry.replacement_text}"
                </span>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="flex flex-col gap-1">
                {suggestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-sm"
                    onClick={() => handleSelect(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

            <div className="border-t pt-2">
              <Input
                placeholder="Type custom correction..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) {
                      handleSelect(target.value.trim());
                    }
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="font-medium text-sm">Train this word</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Original: "{word}"</Label>
              <Input
                placeholder="Replace with..."
                value={replacementText}
                onChange={(e) => setReplacementText(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="always-replace"
                checked={alwaysReplace}
                onCheckedChange={setAlwaysReplace}
              />
              <Label
                htmlFor="always-replace"
                className="text-xs cursor-pointer"
              >
                Always replace for this profile
              </Label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Pronunciation hint (optional)
              </Label>
              <Input
                placeholder="e.g., 'sounds like...'"
                value={pronunciationHint}
                onChange={(e) => setPronunciationHint(e.target.value)}
                className="h-7 text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8"
                onClick={() => setShowTraining(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-8"
                onClick={handleTrainWord}
                disabled={!replacementText.trim()}
              >
                Save Training
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Help Me Write styles
type HelpMeWriteStyle = "formal" | "casual" | "creative" | "creative_writing";

const HELP_ME_WRITE_STYLES: {
  value: HelpMeWriteStyle;
  label: string;
  description: string;
}[] = [
  { value: "formal", label: "Formal", description: "Professional, polished" },
  { value: "casual", label: "Casual", description: "Friendly, conversational" },
  { value: "creative", label: "Creative", description: "Unique, expressive" },
  {
    value: "creative_writing",
    label: "Literary",
    description: "Narrative flair",
  },
];

// Help Me Write Panel Component
function HelpMeWritePanel({
  selectedText,
  onReplace,
  onInsertBelow,
  onCopy,
  onClose,
}: {
  selectedText: string;
  onReplace: (newText: string) => void;
  onInsertBelow: (newText: string) => void;
  onCopy: (newText: string) => void;
  onClose: () => void;
}) {
  const [style, setStyle] = useState<HelpMeWriteStyle>("formal");
  const [rewrittenText, setRewrittenText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Simple local text rewriting (no external API needed)
  const rewriteText = (
    text: string,
    selectedStyle: HelpMeWriteStyle
  ): string => {
    let result = text;

    switch (selectedStyle) {
      case "formal":
        result = result
          .replace(/\bdon't\b/gi, "do not")
          .replace(/\bcan't\b/gi, "cannot")
          .replace(/\bwon't\b/gi, "will not")
          .replace(/\bit's\b/gi, "it is")
          .replace(/\bthat's\b/gi, "that is")
          .replace(/\bI'm\b/gi, "I am")
          .replace(/\byou're\b/gi, "you are")
          .replace(/\bwe're\b/gi, "we are")
          .replace(/\bthey're\b/gi, "they are")
          .replace(/\bkind of\b/gi, "somewhat")
          .replace(/\bsort of\b/gi, "somewhat")
          .replace(/\bgot\b/gi, "received")
          .replace(/\bget\b/gi, "obtain")
          .replace(/\bbig\b/gi, "substantial")
          .replace(/\bgood\b/gi, "excellent")
          .replace(/\bbad\b/gi, "unfavorable");
        break;
      case "casual":
        result = result
          .replace(/\bdo not\b/gi, "don't")
          .replace(/\bcannot\b/gi, "can't")
          .replace(/\bwill not\b/gi, "won't")
          .replace(/\bit is\b/gi, "it's")
          .replace(/\bthat is\b/gi, "that's")
          .replace(/\bI am\b/gi, "I'm")
          .replace(/\byou are\b/gi, "you're")
          .replace(/\bwe are\b/gi, "we're")
          .replace(/\bthey are\b/gi, "they're")
          .replace(/\bHowever,\b/gi, "But")
          .replace(/\bTherefore,\b/gi, "So")
          .replace(/\bFurthermore,\b/gi, "Also")
          .replace(/\bIn addition,\b/gi, "Plus");
        break;
      case "creative":
        result = result
          .replace(/\bvery\b/gi, "incredibly")
          .replace(/\bgood\b/gi, "fantastic")
          .replace(/\bnice\b/gi, "wonderful")
          .replace(/\binteresting\b/gi, "fascinating")
          .replace(/\bimportant\b/gi, "crucial")
          .replace(/\bsaid\b/gi, "exclaimed")
          .replace(/\bwalked\b/gi, "strolled")
          .replace(/\blooked\b/gi, "gazed");
        break;
      case "creative_writing":
        result = result
          .replace(/\bThe\b/g, (m, offset) =>
            offset === 0 ? "In the tapestry of moments, the" : m
          )
          .replace(/\bvery\b/gi, "remarkably")
          .replace(/\bsaw\b/gi, "witnessed")
          .replace(/\bfelt\b/gi, "sensed deeply")
          .replace(/\bwas\b/gi, "seemed to be")
          .replace(/\bhappy\b/gi, "filled with joy")
          .replace(/\bsad\b/gi, "touched by melancholy");
        break;
    }

    return result;
  };

  const handleRewrite = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const result = rewriteText(selectedText, style);
      setRewrittenText(result);
      setIsProcessing(false);
    }, 300);
  };

  useEffect(() => {
    if (selectedText) {
      handleRewrite();
    }
  }, [style, selectedText]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Help Me Write</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {HELP_ME_WRITE_STYLES.map((s) => (
            <Button
              key={s.value}
              variant={style === s.value ? "default" : "outline"}
              size="sm"
              className="h-auto py-1.5 px-2 flex flex-col items-start text-left"
              onClick={() => setStyle(s.value)}
            >
              <span className="text-xs font-medium">{s.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="p-2 bg-primary/5 border border-primary/20 rounded-md text-sm max-h-20 overflow-auto">
          {isProcessing ? (
            <span className="text-muted-foreground animate-pulse">
              Processing...
            </span>
          ) : (
            rewrittenText || selectedText
          )}
        </div>
      </div>

      <div className="flex gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 h-8"
                onClick={() => onReplace(rewrittenText)}
                disabled={!rewrittenText || isProcessing}
              >
                <Replace className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Replace</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 h-8"
                onClick={() => onInsertBelow(rewrittenText)}
                disabled={!rewrittenText || isProcessing}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert below</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 h-8"
                onClick={() => onCopy(rewrittenText)}
                disabled={!rewrittenText || isProcessing}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// Microphone Waveform Component
function MicrophoneWaveform({
  isActive,
  audioLevel,
}: {
  isActive: boolean;
  audioLevel: number;
}) {
  const bars = 24;
  const [levels, setLevels] = useState<number[]>(Array(bars).fill(0.1));

  useEffect(() => {
    if (!isActive) {
      setLevels(Array(bars).fill(0.1));
      return;
    }

    const interval = setInterval(() => {
      setLevels((prev) =>
        prev.map((_, i) => {
          const base = audioLevel * 0.3;
          const variation = Math.random() * 0.7;
          const centerBias = 1 - Math.abs(i - bars / 2) / (bars / 2);
          return Math.min(1, base + variation * centerBias);
        })
      );
    }, 80);

    return () => clearInterval(interval);
  }, [isActive, audioLevel]);

  return (
    <div className="flex items-center justify-center gap-0.5 h-8 w-full">
      {levels.map((level, i) => (
        <div
          key={i}
          className="w-1 bg-primary/60 rounded-full transition-all duration-75"
          style={{
            height: `${Math.max(4, level * 28)}px`,
            opacity: isActive ? 0.4 + level * 0.6 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

// The Orb Component
function SpeakOrb({
  state,
  onClick,
  onDoubleClick,
  onPressStart,
  onPressEnd,
  position,
  onDrag,
}: {
  state: OrbState;
  onClick: () => void;
  onDoubleClick: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  position: { x: number; y: number };
  onDrag: (pos: { x: number; y: number }) => void;
}) {
  const orbRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const clickTimeRef = useRef(0);
  const pressTimerRef = useRef<number | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const lastClickRef = useRef(0);

  // Visual state styling
  const getOrbStyles = () => {
    const base =
      "w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 select-none";

    switch (state) {
      case "idle":
        return `${base} bg-background/80 border border-border/50 shadow-lg shadow-black/5 hover:shadow-xl hover:scale-105`;
      case "listening":
        return `${base} bg-primary/10 border-2 border-primary shadow-lg shadow-primary/20 animate-pulse`;
      case "processing":
        return `${base} bg-primary/5 border border-primary/50 shadow-lg animate-spin-slow`;
      case "success":
        return `${base} bg-green-500/10 border-2 border-green-500 shadow-lg shadow-green-500/20`;
      case "error":
        return `${base} bg-red-500/10 border-2 border-red-500 shadow-lg shadow-red-500/20`;
      default:
        return base;
    }
  };

  const getIconColor = () => {
    switch (state) {
      case "idle":
        return "text-muted-foreground";
      case "listening":
        return "text-primary";
      case "processing":
        return "text-primary/70";
      case "success":
        return "text-green-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
    clickTimeRef.current = Date.now();

    // Start press timer for push-to-talk
    pressTimerRef.current = window.setTimeout(() => {
      setIsPressing(true);
      onPressStart();
    }, 300);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setIsDragging(true);
        if (pressTimerRef.current) {
          clearTimeout(pressTimerRef.current);
          pressTimerRef.current = null;
        }
        // Constrain to screen bounds using position manager
        const newPosition = {
          x: positionStartRef.current.x + dx,
          y: positionStartRef.current.y + dy,
        };
        const constrained = OrbPositionManager.constrainPosition(newPosition as OrbPosition);
        onDrag(constrained);
      }
    };

    const handleMouseUp = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }

      if (isPressing) {
        setIsPressing(false);
        onPressEnd();
      } else if (!isDragging) {
        const now = Date.now();
        if (now - lastClickRef.current < 300) {
          onDoubleClick();
        } else {
          onClick();
        }
        lastClickRef.current = now;
      }

      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    positionStartRef.current = { ...position };
    clickTimeRef.current = Date.now();

    pressTimerRef.current = window.setTimeout(() => {
      setIsPressing(true);
      onPressStart();
    }, 300);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartRef.current.x;
    const dy = touch.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setIsDragging(true);
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      onDrag({
        x: Math.max(
          0,
          Math.min(window.innerWidth - 56, positionStartRef.current.x + dx)
        ),
        y: Math.max(
          0,
          Math.min(window.innerHeight - 56, positionStartRef.current.y + dy)
        ),
      });
    }
  };

  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isPressing) {
      setIsPressing(false);
      onPressEnd();
    } else if (!isDragging) {
      const now = Date.now();
      if (now - lastClickRef.current < 300) {
        onDoubleClick();
      } else {
        onClick();
      }
      lastClickRef.current = now;
    }

    setIsDragging(false);
  };

  return (
    <div
      ref={orbRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
        // Ensure orb is always on top and interactable
        pointerEvents: "auto",
        // Prevent focus stealing
        tabIndex: -1,
      }}
      onMouseEnter={() => FocusManager.setOrbInteracting(true)}
      onMouseLeave={() => FocusManager.setOrbInteracting(false)}
    >
      <div
        className={getOrbStyles()}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {state === "listening" ? (
          <Mic className={`h-6 w-6 ${getIconColor()}`} />
        ) : state === "error" ? (
          <MicOff className={`h-6 w-6 ${getIconColor()}`} />
        ) : (
          <Mic className={`h-6 w-6 ${getIconColor()}`} />
        )}
      </div>

      {/* Glow effect for listening state */}
      {state === "listening" && (
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping pointer-events-none" />
      )}
    </div>
  );
}

// Expandable Panel Component
function ExpandablePanel({
  isExpanded,
  onClose,
  onExpandClick,
  transcript,
  interimTranscript,
  mode,
  onModeChange,
  isPaused,
  onPauseToggle,
  isMuted,
  onMuteToggle,
  onSettingsClick,
  onWordCorrect,
  onTrainWord,
  dictionaryLookup,
  isListening,
  audioLevel,
  position,
  selectedText,
  onTextSelection,
  showHelpMeWrite,
  onHelpMeWriteToggle,
  onHelpMeWriteReplace,
  onHelpMeWriteInsert,
  onHelpMeWriteCopy,
  onCopyTranscript,
  onClearTranscript,
  copied,
}: {
  isExpanded: boolean;
  onClose: () => void;
  onExpandClick: () => void;
  transcript: string;
  interimTranscript: string;
  mode: DictationMode;
  onModeChange: (mode: DictationMode) => void;
  isPaused: boolean;
  onPauseToggle: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  onSettingsClick: () => void;
  onWordCorrect: (index: number, newWord: string) => void;
  onTrainWord: (
    original: string,
    replacement: string,
    always: boolean,
    hint: string
  ) => void;
  dictionaryLookup: Record<string, PersonalDictionaryEntryModel>;
  isListening: boolean;
  audioLevel: number;
  position: { x: number; y: number };
  selectedText: string;
  onTextSelection: () => void;
  showHelpMeWrite: boolean;
  onHelpMeWriteToggle: (show: boolean) => void;
  onHelpMeWriteReplace: (text: string) => void;
  onHelpMeWriteInsert: (text: string) => void;
  onHelpMeWriteCopy: (text: string) => void;
  onCopyTranscript: () => void;
  onClearTranscript: () => void;
  copied: boolean;
}) {
  if (!isExpanded) return null;

  // Render transcript with clickable words
  const renderClickableTranscript = () => {
    if (!transcript && !interimTranscript) {
      return (
        <p className="text-muted-foreground/60 italic text-center py-8">
          Start speaking...
        </p>
      );
    }

    const parts = transcript.split(/(\s+)/);
    let wordIndex = 0;

    return (
      <p
        className="whitespace-pre-wrap text-xl leading-relaxed font-light"
        onMouseUp={onTextSelection}
      >
        {parts.map((part, idx) => {
          if (part.trim()) {
            const currentWordIndex = wordIndex;
            wordIndex++;
            const cleanWord = part
              .replace(/[.,!?;:'"()-]+$/, "")
              .toLowerCase();
            const existingEntry = dictionaryLookup[cleanWord] || null;
            return (
              <ClickableWord
                key={idx}
                word={part}
                index={currentWordIndex}
                onCorrect={onWordCorrect}
                onTrain={onTrainWord}
                existingEntry={existingEntry}
              />
            );
          }
          return <span key={idx}>{part}</span>;
        })}
        {interimTranscript && (
          <span className="text-muted-foreground/50"> {interimTranscript}</span>
        )}
      </p>
    );
  };

  // Calculate panel position based on orb position
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 49,
    maxHeight: "70vh",
    width: "340px",
  };

  // Position panel to the side of the orb
  if (position.x > window.innerWidth / 2) {
    panelStyle.right = window.innerWidth - position.x + 20;
    panelStyle.top = Math.max(20, Math.min(position.y - 100, window.innerHeight - 500));
  } else {
    panelStyle.left = position.x + 70;
    panelStyle.top = Math.max(20, Math.min(position.y - 100, window.innerHeight - 500));
  }

  return (
    <Card
      className="shadow-2xl border-border/50 backdrop-blur-xl bg-background/95"
      style={panelStyle}
    >
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium">SpeakOrb</span>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={onExpandClick}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expand to full view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Waveform */}
        <div className="px-2">
          <MicrophoneWaveform isActive={isListening} audioLevel={audioLevel} />
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {(["dictation", "command", "focus"] as DictationMode[]).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "ghost"}
              size="sm"
              className="flex-1 h-7 text-xs capitalize"
              onClick={() => onModeChange(m)}
            >
              {m}
            </Button>
          ))}
        </div>

        {/* Transcription Preview */}
        <ScrollArea className="h-48 rounded-lg border border-border/30 bg-muted/20 p-3">
          {showHelpMeWrite && selectedText ? (
            <HelpMeWritePanel
              selectedText={selectedText}
              onReplace={onHelpMeWriteReplace}
              onInsertBelow={onHelpMeWriteInsert}
              onCopy={onHelpMeWriteCopy}
              onClose={() => onHelpMeWriteToggle(false)}
            />
          ) : (
            renderClickableTranscript()
          )}
        </ScrollArea>

        {/* Help Me Write Button */}
        {selectedText && !showHelpMeWrite && !isListening && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => onHelpMeWriteToggle(true)}
          >
            <Wand2 className="h-4 w-4" />
            Help Me Write
          </Button>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onPauseToggle}
                  >
                    {isPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onMuteToggle}
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onSettingsClick}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onCopyTranscript}
                    disabled={!transcript}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy all</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClearTranscript}
                    disabled={!transcript}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Expanded Full View Component
function ExpandedFullView({
  isOpen,
  onClose,
  onMinimize,
  transcript,
  interimTranscript,
  mode,
  onModeChange,
  isPaused,
  onPauseToggle,
  isMuted,
  onMuteToggle,
  isListening,
  audioLevel,
  onToggleDictation,
  onWordCorrect,
  onTrainWord,
  dictionaryLookup,
  dictionaryEntries,
  selectedText,
  onTextSelection,
  showHelpMeWrite,
  onHelpMeWriteToggle,
  onHelpMeWriteReplace,
  onHelpMeWriteInsert,
  onHelpMeWriteCopy,
  onCopyTranscript,
  onClearTranscript,
  copied,
  // Settings props
  autoClean,
  onAutoCleanChange,
  enableShortcuts,
  onEnableShortcutsChange,
  selectedLanguage,
  onLanguageChange,
  // Profile props
  voiceProfiles,
  activeProfile,
  onCreateProfile,
  onSwitchProfile,
  onDeleteProfile,
  // Shortcuts
  shortcuts,
  onDeleteDictionaryEntry,
}: {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  transcript: string;
  interimTranscript: string;
  mode: DictationMode;
  onModeChange: (mode: DictationMode) => void;
  isPaused: boolean;
  onPauseToggle: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  isListening: boolean;
  audioLevel: number;
  onToggleDictation: () => void;
  onWordCorrect: (index: number, newWord: string) => void;
  onTrainWord: (
    original: string,
    replacement: string,
    always: boolean,
    hint: string
  ) => void;
  dictionaryLookup: Record<string, PersonalDictionaryEntryModel>;
  dictionaryEntries: PersonalDictionaryEntryModel[];
  selectedText: string;
  onTextSelection: () => void;
  showHelpMeWrite: boolean;
  onHelpMeWriteToggle: (show: boolean) => void;
  onHelpMeWriteReplace: (text: string) => void;
  onHelpMeWriteInsert: (text: string) => void;
  onHelpMeWriteCopy: (text: string) => void;
  onCopyTranscript: () => void;
  onClearTranscript: () => void;
  copied: boolean;
  autoClean: boolean;
  onAutoCleanChange: (value: boolean) => void;
  enableShortcuts: boolean;
  onEnableShortcutsChange: (value: boolean) => void;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  voiceProfiles: VoiceProfileModel[];
  activeProfile: VoiceProfileModel | null;
  onCreateProfile: (name: string) => void;
  onSwitchProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  shortcuts: Array<{ id: string; trigger_phrase: string; expansion_text: string; is_enabled: boolean }>;
  onDeleteDictionaryEntry: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"transcription" | "dictionary" | "settings">("transcription");
  const [newProfileName, setNewProfileName] = useState("");

  if (!isOpen) return null;

  // Render transcript with clickable words
  const renderClickableTranscript = () => {
    if (!transcript && !interimTranscript) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60">
          <Mic className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-light">Start speaking to see your words appear here...</p>
          <p className="text-sm mt-2">Click the orb or press the button below to begin</p>
        </div>
      );
    }

    const parts = transcript.split(/(\s+)/);
    let wordIndex = 0;

    return (
      <p
        className="whitespace-pre-wrap text-xl leading-relaxed font-light"
        onMouseUp={onTextSelection}
      >
        {parts.map((part, idx) => {
          if (part.trim()) {
            const currentWordIndex = wordIndex;
            wordIndex++;
            const cleanWord = part.replace(/[.,!?;:'"()-]+$/, "").toLowerCase();
            const existingEntry = dictionaryLookup[cleanWord] || null;
            return (
              <ClickableWord
                key={idx}
                word={part}
                index={currentWordIndex}
                onCorrect={onWordCorrect}
                onTrain={onTrainWord}
                existingEntry={existingEntry}
              />
            );
          }
          return <span key={idx}>{part}</span>;
        })}
        {interimTranscript && (
          <span className="text-muted-foreground/50"> {interimTranscript}</span>
        )}
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'}`} />
          <h1 className="text-xl font-semibold">SpeakOrb</h1>
          <Badge variant="outline" className="text-xs">
            {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={onMinimize}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Minimize to orb</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Navigation */}
        <div className="w-48 border-r p-4 flex flex-col gap-2">
          <Button
            variant={activeTab === "transcription" ? "default" : "ghost"}
            className="justify-start gap-2"
            onClick={() => setActiveTab("transcription")}
          >
            <PenLine className="h-4 w-4" />
            Transcription
          </Button>
          <Button
            variant={activeTab === "dictionary" ? "default" : "ghost"}
            className="justify-start gap-2"
            onClick={() => setActiveTab("dictionary")}
          >
            <BookOpen className="h-4 w-4" />
            Dictionary
          </Button>
          <Button
            variant={activeTab === "settings" ? "default" : "ghost"}
            className="justify-start gap-2"
            onClick={() => setActiveTab("settings")}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>

          {/* Quick controls at bottom of sidebar */}
          <div className="mt-auto pt-4 border-t space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="truncate">{activeProfile?.name || "No Profile"}</span>
            </div>
            <div className="flex gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={onPauseToggle}
                    >
                      {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={onMuteToggle}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Content */}
          {activeTab === "transcription" && (
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              {/* Waveform */}
              <div className="mb-4">
                <MicrophoneWaveform isActive={isListening} audioLevel={audioLevel} />
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg mb-4 w-fit">
                {(["dictation", "command", "focus"] as DictationMode[]).map((m) => (
                  <Button
                    key={m}
                    variant={mode === m ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-sm capitalize"
                    onClick={() => onModeChange(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>

              {/* Transcription Area */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full rounded-lg border border-border/30 bg-muted/10 p-6">
                  {showHelpMeWrite && selectedText ? (
                    <HelpMeWritePanel
                      selectedText={selectedText}
                      onReplace={onHelpMeWriteReplace}
                      onInsertBelow={onHelpMeWriteInsert}
                      onCopy={onHelpMeWriteCopy}
                      onClose={() => onHelpMeWriteToggle(false)}
                    />
                  ) : (
                    renderClickableTranscript()
                  )}
                </ScrollArea>
              </div>

              {/* Help Me Write Button */}
              {selectedText && !showHelpMeWrite && !isListening && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onHelpMeWriteToggle(true)}
                  >
                    <Wand2 className="h-4 w-4" />
                    Help Me Write
                  </Button>
                </div>
              )}

              {/* Bottom Controls */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  size="lg"
                  className={`gap-2 ${isListening ? 'bg-red-500 hover:bg-red-600' : ''}`}
                  onClick={onToggleDictation}
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-5 w-5" />
                      Stop Dictation
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      Start Dictation
                    </>
                  )}
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={onCopyTranscript}
                    disabled={!transcript}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={onClearTranscript}
                    disabled={!transcript}
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "dictionary" && (
            <div className="flex-1 p-6 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Personal Dictionary</h2>
                  <p className="text-sm text-muted-foreground">
                    Trained words for {activeProfile?.name || "current profile"}
                  </p>
                </div>
                <Badge variant="secondary">{dictionaryEntries.length} entries</Badge>
              </div>

              <ScrollArea className="flex-1">
                {dictionaryEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                    <p className="text-lg font-light">No trained words yet</p>
                    <p className="text-sm mt-2">Right-click any word in your transcription to train it</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dictionaryEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium">{entry.original_text}</p>
                            <p className="text-sm text-muted-foreground">→ {entry.replacement_text}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.is_always_replace && (
                              <Badge variant="outline" className="text-xs">Auto-replace</Badge>
                            )}
                            {entry.pronunciation_hint && (
                              <Badge variant="secondary" className="text-xs">
                                Hint: {entry.pronunciation_hint}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => onDeleteDictionaryEntry(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="flex-1 p-6 overflow-auto">
              <div className="max-w-2xl space-y-8">
                {/* Profile Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Voice Profiles</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Each profile has its own dictionary and training data.
                  </p>

                  {/* Create new profile */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New profile name..."
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newProfileName.trim()) {
                          onCreateProfile(newProfileName.trim());
                          setNewProfileName("");
                        }
                      }}
                      className="max-w-xs"
                    />
                    <Button
                      onClick={() => {
                        if (newProfileName.trim()) {
                          onCreateProfile(newProfileName.trim());
                          setNewProfileName("");
                        }
                      }}
                      disabled={!newProfileName.trim()}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create
                    </Button>
                  </div>

                  {/* Existing profiles */}
                  <div className="grid gap-2">
                    {voiceProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          profile.is_active ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              profile.is_active ? "bg-primary/20" : "bg-muted"
                            }`}
                          >
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{profile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {dictionaryEntries.filter((e) => e.profile_id === profile.id).length} trained words
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {profile.is_active ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onSwitchProfile(profile.id)}
                            >
                              Activate
                            </Button>
                          )}
                          {voiceProfiles.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => onDeleteProfile(profile.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Language Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Languages className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Language</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <Button
                        key={lang.code}
                        variant={selectedLanguage === lang.code ? "default" : "outline"}
                        size="sm"
                        onClick={() => onLanguageChange(lang.code)}
                      >
                        {lang.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Processing Options */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Text Processing</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Remove filler words</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically remove "um", "uh", "like", etc.
                        </p>
                      </div>
                      <Switch checked={autoClean} onCheckedChange={onAutoCleanChange} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Voice shortcuts</p>
                        <p className="text-sm text-muted-foreground">
                          Expand trigger phrases into longer text
                        </p>
                      </div>
                      <Switch checked={enableShortcuts} onCheckedChange={onEnableShortcutsChange} />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Voice Shortcuts Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Voice Shortcuts</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Say a trigger phrase to automatically insert expanded text.
                  </p>

                  {shortcuts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No shortcuts configured yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shortcuts.filter(s => s.is_enabled).map((shortcut) => (
                        <div
                          key={shortcut.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div>
                            <p className="font-mono text-sm font-medium">"{shortcut.trigger_phrase}"</p>
                            <p className="text-sm text-muted-foreground">→ {shortcut.expansion_text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Privacy Note */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    🔒 All training data is stored locally per profile. Your voice data and corrections never leave your device.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const queryClient = useQueryClient();
  const [currentUserId] = useState("user-1");

  // Dictation state (preserved from original)
  const [isDictating, setIsDictating] = useState(false);
  const [rawTranscript, setRawTranscript] = useState("");
  const [processedTranscript, setProcessedTranscript] = useState("");
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [appliedShortcuts, setAppliedShortcuts] = useState<string[]>([]);

  // Settings state
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [autoClean, setAutoClean] = useState(true);
  const [enableShortcuts, setEnableShortcuts] = useState(true);

  // SpeakOrb UI state
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);
  // Orb position with multi-monitor and DPI support
  // Crash-safe: validate position on startup, reset if invalid
  const [orbPosition, setOrbPosition] = useState<OrbPosition>(() => {
    try {
      const position = OrbPositionManager.loadPosition();
      // Validate position is on screen
      const validated = OrbPositionManager.validatePosition(position);
      return validated;
    } catch (error) {
      console.error("Failed to load orb position, using default:", error);
      // Return safe default position
      return OrbPositionManager.getDefaultPosition();
    }
  });
  const [mode, setMode] = useState<DictationMode>("dictation");
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0.5);

  // UI state
  const [copied, setCopied] = useState(false);
  const [demoInput, setDemoInput] = useState("");

  // Profile management state
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  // Help Me Write state
  const [showHelpMeWrite, setShowHelpMeWrite] = useState(false);
  const [selectedTextForRewrite, setSelectedTextForRewrite] = useState("");
  const [selectionRange, setSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Hooks
  const speechRecognition = useSpeechRecognition();
  
  // Runtime interface - unified access to all SpeakOrb capabilities
  const runtime = getRuntime();
  const runtimeHook = useSpeakOrbRuntime();
  const runtimeInitializedRef = useRef(false);

  // Initialize runtime on mount
  useEffect(() => {
    if (!runtimeInitializedRef.current) {
      runtime.initialize(speechRecognition);
      runtime.setUserId(currentUserId);
      runtimeInitializedRef.current = true;
    }
  }, [speechRecognition, currentUserId, runtime]);

  // Migrate all profiles on mount (one-time migration check)
  useEffect(() => {
    const migrateProfiles = async () => {
      try {
        const migratedCount = await profileStorageRef.current.migrateAllProfiles(
          currentUserId
        );
        if (migratedCount > 0) {
          console.log(`Migrated ${migratedCount} profile(s) to schema version ${CURRENT_SCHEMA_VERSION}`);
          queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
        }
      } catch (error) {
        console.error("Profile migration failed:", error);
      }
    };

    migrateProfiles();
  }, [currentUserId, queryClient]);

  // Check if we should use demo mode
  const useDemoMode = !speechRecognition.state.isSupported;

  // ORM instances
  const transcriptionSessionORMRef = useRef(
    TranscriptionSessionORM.getInstance()
  );
  const voiceShortcutORMRef = useRef(VoiceShortcutORM.getInstance());
  const userSettingsORMRef = useRef(UserSettingsORM.getInstance());
  const voiceProfileORMRef = useRef(VoiceProfileORM.getInstance());
  const personalDictionaryORMRef = useRef(
    PersonalDictionaryEntryORM.getInstance()
  );
  const profileStorageRef = useRef(getProfileStorage());

  // Save orb position with screen context
  useEffect(() => {
    OrbPositionManager.savePosition(orbPosition);
  }, [orbPosition]);

  // Validate position on window resize and screen change
  useEffect(() => {
    const handleResize = () => {
      setOrbPosition((current) => {
        const validated = OrbPositionManager.handleResize(current);
        return validated;
      });
    };

    const handleScreenChange = () => {
      setOrbPosition((current) => {
        const validated = OrbPositionManager.handleScreenChange(current);
        return validated;
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    
    // Listen for screen changes (multi-monitor)
    // Note: This is a workaround - browsers don't have direct screen change events
    // We check periodically and on focus
    const checkScreenInterval = setInterval(() => {
      if (OrbPositionManager.needsValidation(orbPosition)) {
        handleScreenChange();
      }
    }, 1000);

    window.addEventListener("focus", handleScreenChange);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      window.removeEventListener("focus", handleScreenChange);
      clearInterval(checkScreenInterval);
    };
  }, [orbPosition]);

  // Simulate audio level changes when dictating
  useEffect(() => {
    if (!isDictating) {
      setAudioLevel(0);
      return;
    }

    const interval = setInterval(() => {
      setAudioLevel(0.3 + Math.random() * 0.7);
    }, 100);

    return () => clearInterval(interval);
  }, [isDictating]);

  // Update orb state based on dictation state (via runtime)
  // Ensure errors are visible (no silent failures)
  useEffect(() => {
    const dictationState = runtimeHook.dictationState;
    if (isDictating) {
      setOrbState("listening");
    } else if (dictationState?.error) {
      setOrbState("error");
      // Show error notification (import toast dynamically to avoid issues)
      import("sonner").then(({ toast }) => {
        toast.error("Dictation error", {
          description: dictationState.error?.message || "An error occurred during dictation",
          duration: 5000,
        });
      }).catch(() => {
        // Fallback if toast not available
        console.error("Dictation error:", dictationState.error);
      });
      setTimeout(() => setOrbState("idle"), 2000);
    } else {
      setOrbState("idle");
    }
  }, [isDictating, runtimeHook.dictationState]);

  // Fetch user settings
  const { data: userSettings } = useQuery({
    queryKey: ["userSettings", currentUserId],
    queryFn: async () => {
      try {
        const settings =
          await userSettingsORMRef.current.getUserSettingsByUserId(
            currentUserId
          );
        return settings[0] || null;
      } catch {
        return null;
      }
    },
  });

  // Fetch voice profiles
  const { data: voiceProfiles = [] } = useQuery({
    queryKey: ["voiceProfiles", currentUserId],
    queryFn: async () => {
      try {
        const profiles =
          await voiceProfileORMRef.current.getVoiceProfileByUserId(
            currentUserId
          );
        return Array.isArray(profiles) ? profiles : [];
      } catch {
        return [];
      }
    },
  });

  // Get active profile
  const activeProfile = useMemo(() => {
    return voiceProfiles.find((p) => p.is_active) || voiceProfiles[0] || null;
  }, [voiceProfiles]);

  // Update runtime with profiles and set current profile
  useEffect(() => {
    runtime.updateProfiles(voiceProfiles);
    if (activeProfile?.id) {
      runtime.setCurrentProfile(activeProfile.id).catch(console.error);
    }
  }, [voiceProfiles, activeProfile?.id, runtime]);

  // Fetch personal dictionary entries for active profile
  const { data: dictionaryEntries = [] } = useQuery({
    queryKey: ["personalDictionary", activeProfile?.id],
    queryFn: async () => {
      if (!activeProfile?.id) return [];
      try {
        const entries =
          await personalDictionaryORMRef.current.getPersonalDictionaryEntryByProfileId(
            activeProfile.id
          );
        return Array.isArray(entries) ? entries : [];
      } catch {
        return [];
      }
    },
    enabled: !!activeProfile?.id,
  });

  // Build a lookup map for dictionary entries by original_text (lowercase)
  const dictionaryLookup = useMemo(() => {
    const lookup: Record<string, PersonalDictionaryEntryModel> = {};
    for (const entry of dictionaryEntries) {
      if (entry.is_enabled) {
        lookup[entry.original_text.toLowerCase()] = entry;
      }
    }
    return lookup;
  }, [dictionaryEntries]);

  // Create profile mutation with versioned storage
  const createProfileMutation = useMutation({
    mutationFn: async (name: string) => {
      // Deactivate all existing profiles
      for (const profile of voiceProfiles) {
        if (profile.is_active) {
          await voiceProfileORMRef.current.setVoiceProfileById(profile.id, {
            ...profile,
            is_active: false,
          });
        }
      }
      
      // Create new profile with versioned storage (includes defaults)
      const versionedProfile = await profileStorageRef.current.createProfile(
        currentUserId,
        name,
        {
          defaultDictionaryEntries: [], // Can add defaults here
          settings: {
            autoClean: true,
            enableShortcuts: true,
            selectedLanguage: "en-US",
          },
        }
      );

      // Initialize default dictionary entries
      await profileStorageRef.current.initializeDefaultDictionary(
        versionedProfile.id,
        currentUserId
      );

      // Set as active
      await voiceProfileORMRef.current.setVoiceProfileById(versionedProfile.id, {
        ...versionedProfile,
        is_active: true,
      });

      return versionedProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
      setShowProfileDialog(false);
      setNewProfileName("");
    },
  });

  // Switch profile mutation with atomic save
  const switchProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      // Load profiles with versioning
      const allProfiles = await Promise.all(
        voiceProfiles.map((p) => profileStorageRef.current.loadProfile(p.id))
      );

      // Update all profiles atomically
      await Promise.all(
        allProfiles.map(async (profile) => {
          const updated = {
            ...profile,
            is_active: profile.id === profileId,
          };
          // Use atomic save with version check
          await profileStorageRef.current.saveProfile(updated, {
            updateMetadata: false,
            skipVersionCheck: false, // Enable version check for safety
          });
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
      // Learning store will be re-initialized when activeProfile changes
    },
  });

  // Delete profile mutation with cleanup
  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      // Use profile storage delete (handles cleanup of dictionary entries)
      await profileStorageRef.current.deleteProfile(profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
    },
  });

  // Train word mutation
  const trainWordMutation = useMutation({
    mutationFn: async (data: {
      originalWord: string;
      replacementWord: string;
      alwaysReplace: boolean;
      pronunciationHint: string;
    }) => {
      if (!activeProfile?.id) return null;

      const existingEntries =
        await personalDictionaryORMRef.current.getPersonalDictionaryEntryByOriginalTextProfileId(
          data.originalWord.toLowerCase(),
          activeProfile.id
        );

      if (existingEntries.length > 0) {
        const existing = existingEntries[0];
        await personalDictionaryORMRef.current.setPersonalDictionaryEntryById(
          existing.id,
          {
            ...existing,
            replacement_text: data.replacementWord,
            is_always_replace: data.alwaysReplace,
            pronunciation_hint: data.pronunciationHint || null,
          }
        );
        return existing;
      } else {
        const isPhrase = data.originalWord.includes(" ");
        const entry =
          await personalDictionaryORMRef.current.insertPersonalDictionaryEntry([
            {
              profile_id: activeProfile.id,
              user_id: currentUserId,
              original_text: data.originalWord.toLowerCase(),
              replacement_text: data.replacementWord,
              entry_type: isPhrase
                ? PersonalDictionaryEntryEntryType.phrase
                : PersonalDictionaryEntryEntryType.word,
              is_always_replace: data.alwaysReplace,
              pronunciation_hint: data.pronunciationHint || null,
              priority: isPhrase ? 100 : 50,
              is_enabled: true,
            } as PersonalDictionaryEntryModel,
          ]);
        return entry[0];
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
      // Runtime will automatically use updated dictionary entries via updateDictionaryEntries
    },
  });

  // Delete dictionary entry mutation
  const deleteDictionaryEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await personalDictionaryORMRef.current.deletePersonalDictionaryEntryById(entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
    },
  });

  // Sync with user settings
  useEffect(() => {
    if (userSettings) {
      setAutoClean(userSettings.auto_clean_enabled);
      setEnableShortcuts(userSettings.shortcuts_enabled);
      setSelectedLanguage(userSettings.selected_language || "en-US");
    }
  }, [userSettings]);

  // Fetch voice shortcuts
  const { data: shortcuts = [] } = useQuery({
    queryKey: ["voiceShortcuts", currentUserId],
    queryFn: async () => {
      try {
        const allShortcuts =
          await voiceShortcutORMRef.current.getAllVoiceShortcut();
        if (!Array.isArray(allShortcuts)) return [];
        return allShortcuts.filter((s) => s.user_id === currentUserId);
      } catch {
        return [];
      }
    },
  });

  // Convert shortcuts to processing format
  const activeShortcutsRef = useRef<VoiceShortcut[]>([]);
  const activeShortcuts: VoiceShortcut[] = useMemo(() => {
    if (!Array.isArray(shortcuts)) return activeShortcutsRef.current;
    const newShortcuts = shortcuts
      .filter((s) => s && s.is_enabled)
      .map((s) => ({
        trigger: String(s.trigger_phrase || ""),
        expansion: String(s.expansion_text || ""),
      }));
    const currentJson = JSON.stringify(activeShortcutsRef.current);
    const newJson = JSON.stringify(newShortcuts);
    if (currentJson !== newJson) {
      activeShortcutsRef.current = newShortcuts;
    }
    return activeShortcutsRef.current;
  }, [shortcuts]);

  // Update runtime with shortcuts and dictionary entries
  useEffect(() => {
    runtime.updateShortcuts(activeShortcuts);
  }, [activeShortcuts, runtime]);

  useEffect(() => {
    runtime.updateDictionaryEntries(dictionaryEntries);
  }, [dictionaryEntries, runtime]);

  // Update runtime post-processing configuration
  useEffect(() => {
    runtime.configurePostProcessing({
      removeFillers: autoClean,
      enableShortcuts: enableShortcuts,
      applyDictionary: true,
      applyLearning: true,
    });
  }, [autoClean, enableShortcuts, runtime]);

  // Save transcription mutation
  const saveTranscriptionMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      text: string;
      duration: number;
    }) => {
      const session =
        await transcriptionSessionORMRef.current.insertTranscriptionSession([
          {
            user_id: currentUserId,
            profile_id: "",
            title: data.title || `Session ${new Date().toLocaleString()}`,
            transcribed_text: data.text,
            duration: data.duration,
          } as TranscriptionSessionModel,
        ]);
      return session[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcriptionHistory"] });
    },
  });

  // Refs to track last processed values
  const lastProcessedInputRef = useRef<string>("");
  const lastProcessedSettingsRef = useRef<string>("");

  // Process transcript using runtime
  const processTranscript = useCallback(
    (text: string, forceReprocess = false) => {
      const settingsKey = `${autoClean}-${enableShortcuts}-${JSON.stringify(activeShortcuts)}-${dictionaryEntries.length}`;

      if (
        !forceReprocess &&
        text === lastProcessedInputRef.current &&
        settingsKey === lastProcessedSettingsRef.current
      ) {
        return;
      }

      lastProcessedInputRef.current = text;
      lastProcessedSettingsRef.current = settingsKey;

      if (!text.trim()) {
        setProcessedTranscript("");
        setAppliedShortcuts([]);
        return;
      }

      // Use runtime for post-processing
      const processedText = runtime.processText(text);
      
      // Extract applied shortcuts (for UI display)
      const result = processTranscription(
        text,
        enableShortcuts ? activeShortcuts : [],
        {
          removeFillers: autoClean,
          handleCommands: true,
          formatNumbers: false,
          applyShortcuts: enableShortcuts,
        }
      );

      setProcessedTranscript(processedText);
      setAppliedShortcuts(
        Array.isArray(result?.appliedShortcuts) ? result.appliedShortcuts : []
      );
    },
    [
      autoClean,
      enableShortcuts,
      activeShortcuts,
      dictionaryEntries.length,
      runtime,
    ]
  );

  // Subscribe to dictation state changes via runtime
  useEffect(() => {
    const unsubscribe = runtime.subscribeToDictationState((state) => {
      const fullTranscript = state.transcript;
      setRawTranscript(fullTranscript);
      processTranscript(fullTranscript);
    });

    return unsubscribe;
  }, [runtime, processTranscript]);

  // Toggle dictation using runtime
  const toggleDictation = useCallback(() => {
    if (isDictating) {
      if (useDemoMode) {
        speechRecognition.stopDemoMode();
      } else {
        runtime.stopDictation();
      }
      setIsDictating(false);
      // Brief success flash
      setOrbState("success");
      setTimeout(() => setOrbState("idle"), 800);
    } else {
      runtime.resetTranscript();
      if (useDemoMode) {
        speechRecognition.startDemoMode();
      } else {
        runtime.startDictation(selectedLanguage);
      }
      setIsDictating(true);
      setSessionStartTime(Date.now());
      setRawTranscript("");
      setProcessedTranscript("");
      setAppliedShortcuts([]);
      setDemoInput("");
    }
  }, [isDictating, useDemoMode, speechRecognition, selectedLanguage, runtime]);

  // Handle orb click (without stealing focus)
  const handleOrbClick = useCallback(() => {
    FocusManager.saveFocus();
    toggleDictation();
    // Don't restore focus here - let user continue their work
  }, [toggleDictation]);

  // Handle orb double-click (without stealing focus)
  const handleOrbDoubleClick = useCallback(() => {
    FocusManager.saveFocus();
    setIsPanelExpanded((prev) => !prev);
  }, []);

  // Handle push-to-talk start using runtime
  const handlePressStart = useCallback(() => {
    if (!isDictating) {
      runtime.resetTranscript();
      if (useDemoMode) {
        speechRecognition.startDemoMode();
      } else {
        runtime.startDictation(selectedLanguage);
      }
      setIsDictating(true);
      setSessionStartTime(Date.now());
    }
  }, [isDictating, useDemoMode, speechRecognition, selectedLanguage, runtime]);

  // Handle push-to-talk end using runtime
  const handlePressEnd = useCallback(() => {
    if (isDictating) {
      if (useDemoMode) {
        speechRecognition.stopDemoMode();
      } else {
        runtime.stopDictation();
      }
      setIsDictating(false);
      setOrbState("success");
      setTimeout(() => setOrbState("idle"), 800);
    }
  }, [isDictating, useDemoMode, speechRecognition, runtime]);

  // Handle orb drag (with position validation)
  const handleOrbDrag = useCallback((pos: { x: number; y: number }) => {
    // Update position without stealing focus
    FocusManager.preventFocusStealing(() => {
      const constrained = OrbPositionManager.constrainPosition(pos as OrbPosition);
      setOrbPosition(constrained);
    });
  }, []);

  // Handle word correction using runtime
  const handleWordCorrection = useCallback(
    (wordIndex: number, newWord: string) => {
      const words = processedTranscript.split(/(\s+)/);
      let actualWordIndex = 0;
      let originalWord = "";
      for (let i = 0; i < words.length; i++) {
        if (words[i].trim()) {
          if (actualWordIndex === wordIndex) {
            originalWord = words[i].trim();
            words[i] = newWord;
            break;
          }
          actualWordIndex++;
        }
      }
      setProcessedTranscript(words.join(""));

      // Record correction for learning via runtime (async, fire-and-forget)
      if (originalWord && newWord.trim()) {
        const context = processedTranscript
          .substring(Math.max(0, processedTranscript.indexOf(originalWord) - 20))
          .substring(0, 40);
        runtime.recordCorrection(originalWord, newWord.trim(), context, false)
          .catch(console.error);
      }
    },
    [processedTranscript, runtime]
  );

  // Handle training a word using runtime
  const handleTrainWord = useCallback(
    (
      originalWord: string,
      replacementWord: string,
      alwaysReplace: boolean,
      pronunciationHint: string
    ) => {
      trainWordMutation.mutate({
        originalWord,
        replacementWord,
        alwaysReplace,
        pronunciationHint,
      });

      // Record correction for learning via runtime (async, fire-and-forget)
      runtime.recordCorrection(originalWord, replacementWord, pronunciationHint, alwaysReplace)
        .catch(console.error);
    },
    [trainWordMutation, runtime]
  );

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      setSelectedTextForRewrite(selection.toString().trim());
      const text = selection.toString().trim();
      const start = processedTranscript.indexOf(text);
      if (start !== -1) {
        setSelectionRange({ start, end: start + text.length });
      }
    } else {
      setSelectedTextForRewrite("");
      setSelectionRange(null);
    }
  }, [processedTranscript]);

  // Help Me Write handlers
  const handleHelpMeWriteReplace = useCallback(
    (newText: string) => {
      if (selectionRange) {
        const before = processedTranscript.slice(0, selectionRange.start);
        const after = processedTranscript.slice(selectionRange.end);
        setProcessedTranscript(before + newText + after);
      }
      setShowHelpMeWrite(false);
      setSelectedTextForRewrite("");
      setSelectionRange(null);
    },
    [selectionRange, processedTranscript]
  );

  const handleHelpMeWriteInsert = useCallback(
    (newText: string) => {
      if (selectionRange) {
        const before = processedTranscript.slice(0, selectionRange.end);
        const after = processedTranscript.slice(selectionRange.end);
        setProcessedTranscript(before + "\n\n" + newText + after);
      }
      setShowHelpMeWrite(false);
      setSelectedTextForRewrite("");
      setSelectionRange(null);
    },
    [selectionRange, processedTranscript]
  );

  const handleHelpMeWriteCopy = useCallback(
    async (newText: string) => {
      await copyToClipboard(newText);
      setShowHelpMeWrite(false);
      setSelectedTextForRewrite("");
      setSelectionRange(null);
    },
    [copyToClipboard]
  );

  // Clear transcript
  const handleClearTranscript = useCallback(() => {
    setRawTranscript("");
    setProcessedTranscript("");
    speechRecognition.resetTranscript();
    setSelectedTextForRewrite("");
    setSelectionRange(null);
    setShowHelpMeWrite(false);
  }, [speechRecognition]);

  // Keyboard shortcut for Help Me Write (Ctrl/Cmd+Shift+H)
  // Primary: Reads from clipboard (user copies text first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + H
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "h"
      ) {
        // Don't handle if user is typing in an input
        const target = e.target as HTMLElement;
        const isInputElement =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (isInputElement) {
          return; // Let user type
        }

        e.preventDefault();
        
        // Trigger Help Me Write panel (will read from clipboard)
        // The panel component handles reading clipboard
        const event = new CustomEvent("help-me-write-trigger");
        window.dispatchEvent(event);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Global styles for custom animations */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>

      {/* Help Me Write - Independent text selection tool */}
      <HelpMeWriteFloatingPanel />

      {/* The Floating Orb */}
      <SpeakOrb
        state={orbState}
        onClick={handleOrbClick}
        onDoubleClick={handleOrbDoubleClick}
        onPressStart={handlePressStart}
        onPressEnd={handlePressEnd}
        position={orbPosition}
        onDrag={handleOrbDrag}
      />

      {/* Expandable Panel */}
      <ExpandablePanel
        isExpanded={isPanelExpanded}
        onClose={() => setIsPanelExpanded(false)}
        onExpandClick={() => {
          setIsPanelExpanded(false);
          setIsFullViewOpen(true);
        }}
        transcript={processedTranscript}
        interimTranscript={runtimeHook.transcript.interim}
        mode={mode}
        onModeChange={setMode}
        isPaused={isPaused}
        onPauseToggle={() => setIsPaused(!isPaused)}
        isMuted={isMuted}
        onMuteToggle={() => setIsMuted(!isMuted)}
        onSettingsClick={() => setShowSettingsDialog(true)}
        onWordCorrect={handleWordCorrection}
        onTrainWord={handleTrainWord}
        dictionaryLookup={dictionaryLookup}
        isListening={isDictating}
        audioLevel={audioLevel}
        position={orbPosition}
        selectedText={selectedTextForRewrite}
        onTextSelection={handleTextSelection}
        showHelpMeWrite={showHelpMeWrite}
        onHelpMeWriteToggle={setShowHelpMeWrite}
        onHelpMeWriteReplace={handleHelpMeWriteReplace}
        onHelpMeWriteInsert={handleHelpMeWriteInsert}
        onHelpMeWriteCopy={handleHelpMeWriteCopy}
        onCopyTranscript={() => copyToClipboard(processedTranscript)}
        onClearTranscript={handleClearTranscript}
        copied={copied}
      />

      {/* Demo Mode Input (shown when panel is expanded and in demo mode) */}
      {isPanelExpanded && isDictating && useDemoMode && (
        <Card
          className="fixed z-48 w-80 shadow-lg"
          style={{
            left: orbPosition.x > window.innerWidth / 2
              ? orbPosition.x - 340
              : orbPosition.x + 70,
            top: orbPosition.y + 200,
          }}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                Demo Mode
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Type to simulate speech..."
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (demoInput.trim()) {
                      speechRecognition.simulateInput(demoInput.trim());
                      setDemoInput("");
                    }
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() => {
                  if (demoInput.trim()) {
                    speechRecognition.simulateInput(demoInput.trim());
                    setDemoInput("");
                  }
                }}
                disabled={!demoInput.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expanded Full View */}
      <ExpandedFullView
        isOpen={isFullViewOpen}
        onClose={() => setIsFullViewOpen(false)}
        onMinimize={() => {
          setIsFullViewOpen(false);
          setIsPanelExpanded(true);
        }}
        transcript={processedTranscript}
        interimTranscript={runtimeHook.transcript.interim}
        mode={mode}
        onModeChange={setMode}
        isPaused={isPaused}
        onPauseToggle={() => setIsPaused(!isPaused)}
        isMuted={isMuted}
        onMuteToggle={() => setIsMuted(!isMuted)}
        isListening={isDictating}
        audioLevel={audioLevel}
        onToggleDictation={toggleDictation}
        onWordCorrect={handleWordCorrection}
        onTrainWord={handleTrainWord}
        dictionaryLookup={dictionaryLookup}
        dictionaryEntries={dictionaryEntries}
        selectedText={selectedTextForRewrite}
        onTextSelection={handleTextSelection}
        showHelpMeWrite={showHelpMeWrite}
        onHelpMeWriteToggle={setShowHelpMeWrite}
        onHelpMeWriteReplace={handleHelpMeWriteReplace}
        onHelpMeWriteInsert={handleHelpMeWriteInsert}
        onHelpMeWriteCopy={handleHelpMeWriteCopy}
        onCopyTranscript={() => copyToClipboard(processedTranscript)}
        onClearTranscript={handleClearTranscript}
        copied={copied}
        autoClean={autoClean}
        onAutoCleanChange={setAutoClean}
        enableShortcuts={enableShortcuts}
        onEnableShortcutsChange={setEnableShortcuts}
        selectedLanguage={selectedLanguage}
        onLanguageChange={setSelectedLanguage}
        voiceProfiles={voiceProfiles}
        activeProfile={activeProfile}
        onCreateProfile={(name) => createProfileMutation.mutate(name)}
        onSwitchProfile={(id) => switchProfileMutation.mutate(id)}
        onDeleteProfile={(id) => deleteProfileMutation.mutate(id)}
        shortcuts={shortcuts}
        onDeleteDictionaryEntry={(id) => deleteDictionaryEntryMutation.mutate(id)}
      />

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure your SpeakOrb preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Profile selector */}
            <div className="space-y-2">
              <Label className="text-sm">Active Profile</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{activeProfile?.name || "No Profile"}</span>
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>Profiles</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {voiceProfiles.map((profile) => (
                    <DropdownMenuItem
                      key={profile.id}
                      onClick={() => switchProfileMutation.mutate(profile.id)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div
                          className={`w-2 h-2 rounded-full ${profile.is_active ? "bg-primary" : "bg-muted"}`}
                        />
                        <span className="flex-1">{profile.name}</span>
                        {profile.is_active && <Check className="h-4 w-4" />}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowProfileDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Manage Profiles
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Separator />

            {/* Text processing options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-clean" className="text-sm">
                  Remove filler words
                </Label>
                <Switch
                  id="auto-clean"
                  checked={autoClean}
                  onCheckedChange={setAutoClean}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="shortcuts" className="text-sm">
                  Voice shortcuts
                </Label>
                <Switch
                  id="shortcuts"
                  checked={enableShortcuts}
                  onCheckedChange={setEnableShortcuts}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSettingsDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Management Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Profiles</DialogTitle>
            <DialogDescription>
              Each profile has its own dictionary and training data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Create new profile */}
            <div className="space-y-2">
              <Label>Create New Profile</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Profile name..."
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProfileName.trim()) {
                      createProfileMutation.mutate(newProfileName.trim());
                    }
                  }}
                />
                <Button
                  onClick={() =>
                    createProfileMutation.mutate(newProfileName.trim())
                  }
                  disabled={
                    !newProfileName.trim() || createProfileMutation.isPending
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Existing profiles */}
            <div className="space-y-2">
              <Label>Existing Profiles</Label>
              <ScrollArea className="h-[180px]">
                <div className="space-y-2">
                  {voiceProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        profile.is_active ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            profile.is_active ? "bg-primary/20" : "bg-muted"
                          }`}
                        >
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{profile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {
                              dictionaryEntries.filter(
                                (e) => e.profile_id === profile.id
                              ).length
                            }{" "}
                            trained words
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!profile.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              switchProfileMutation.mutate(profile.id)
                            }
                          >
                            Activate
                          </Button>
                        )}
                        {profile.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        )}
                        {voiceProfiles.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() =>
                              deleteProfileMutation.mutate(profile.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Privacy note */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                All training data is stored locally per profile. Your voice
                data and corrections never leave your device.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProfileDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
