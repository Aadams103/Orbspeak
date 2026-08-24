import { createFileRoute } from "@tanstack/react-router";
import { VoiceLibrary } from "@/features/voices/VoiceLibrary";

export const Route = createFileRoute("/voices")({
  component: VoiceLibrary,
});
