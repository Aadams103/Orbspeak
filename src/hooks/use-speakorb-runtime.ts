/**
 * React Hook for SpeakOrb Runtime
 * 
 * Provides React-friendly access to SpeakOrb Runtime interface.
 * Components should use this hook instead of directly accessing runtime.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  SpeakOrbRuntime,
  getRuntime,
  type DictationStateSubscriber,
  type DictationLifecycleSubscriber,
  type ProfileInfo,
  type PostProcessingOptions,
  type HelpMeWriteStyle,
} from "@/lib/speakorb-runtime";
import type { SpeechRecognitionState } from "@/hooks/use-speech-recognition";

export interface UseSpeakOrbRuntimeReturn {
  // Dictation state
  dictationState: SpeechRecognitionState | null;
  isDictating: boolean;
  transcript: { final: string; interim: string };
  
  // Dictation control
  startDictation: (language?: string) => void;
  stopDictation: () => void;
  resetTranscript: () => void;
  
  // Profile management
  currentProfile: ProfileInfo | null;
  profiles: ProfileInfo[];
  setCurrentProfile: (profileId: string) => Promise<void>;
  
  // Post-processing
  processText: (text: string) => string;
  configurePostProcessing: (options: Partial<PostProcessingOptions>) => void;
  recordCorrection: (
    original: string,
    corrected: string,
    context?: string,
    alwaysReplace?: boolean
  ) => Promise<void>;
  
  // Help Me Write
  rewriteText: (text: string, style: HelpMeWriteStyle) => string;
  getHelpMeWriteStyles: () => Array<{ value: HelpMeWriteStyle; label: string; description: string }>;
}

/**
 * React hook for SpeakOrb Runtime
 */
export function useSpeakOrbRuntime(): UseSpeakOrbRuntimeReturn {
  const runtime = getRuntime();
  const [dictationState, setDictationState] = useState<SpeechRecognitionState | null>(
    runtime.getDictationState()
  );
  const [currentProfile, setCurrentProfileState] = useState<ProfileInfo | null>(
    runtime.getCurrentProfile()
  );
  const [profiles, setProfiles] = useState<ProfileInfo[]>(runtime.listProfiles());

  // Subscribe to dictation state
  useEffect(() => {
    const unsubscribe = runtime.subscribeToDictationState((state) => {
      setDictationState(state);
    });

    return unsubscribe;
  }, [runtime]);

  // Subscribe to profile changes
  useEffect(() => {
    const unsubscribe = runtime.subscribeToProfile((profile) => {
      setCurrentProfileState(profile);
      setProfiles(runtime.listProfiles());
    });

    return unsubscribe;
  }, [runtime]);

  // Dictation control
  const startDictation = useCallback(
    (language?: string) => {
      runtime.startDictation(language);
    },
    [runtime]
  );

  const stopDictation = useCallback(() => {
    runtime.stopDictation();
  }, [runtime]);

  const resetTranscript = useCallback(() => {
    runtime.resetTranscript();
  }, [runtime]);

  // Profile management
  const setCurrentProfile = useCallback(
    async (profileId: string) => {
      await runtime.setCurrentProfile(profileId);
    },
    [runtime]
  );

  // Post-processing
  const processText = useCallback(
    (text: string) => {
      return runtime.processText(text);
    },
    [runtime]
  );

  const configurePostProcessing = useCallback(
    (options: Partial<PostProcessingOptions>) => {
      runtime.configurePostProcessing(options);
    },
    [runtime]
  );

  const recordCorrection = useCallback(
    async (
      original: string,
      corrected: string,
      context?: string,
      alwaysReplace?: boolean
    ) => {
      await runtime.recordCorrection(original, corrected, context, alwaysReplace);
    },
    [runtime]
  );

  // Help Me Write
  const rewriteText = useCallback(
    (text: string, style: HelpMeWriteStyle) => {
      return runtime.rewriteText(text, style);
    },
    [runtime]
  );

  const getHelpMeWriteStyles = useCallback(() => {
    return runtime.getHelpMeWriteStyles();
  }, [runtime]);

  // Computed values
  const isDictating = dictationState?.isListening ?? false;
  const transcript = runtime.getTranscript();

  return {
    dictationState,
    isDictating,
    transcript,
    startDictation,
    stopDictation,
    resetTranscript,
    currentProfile,
    profiles,
    setCurrentProfile,
    processText,
    configurePostProcessing,
    recordCorrection,
    rewriteText,
    getHelpMeWriteStyles,
  };
}


