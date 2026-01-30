import { useState, useRef, useCallback, useEffect } from 'react';

export interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  language: string;
  isDemoMode: boolean;
}

export interface UseSpeechRecognitionReturn {
  state: SpeechRecognitionState;
  startListening: (language?: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setLanguage: (language: string) => void;
  simulateInput: (text: string) => void;
  startDemoMode: () => void;
  stopDemoMode: () => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const isSupported = SpeechRecognitionAPI != null;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    isSupported,
    language: 'en-US',
    isDemoMode: false,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef<string>('');
  const shouldRestartRef = useRef<boolean>(false);
  const languageRef = useRef<string>('en-US');

  const createRecognition = useCallback((lang?: string) => {
    if (!SpeechRecognitionAPI) return null;

    const language = lang || languageRef.current;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = transcriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += text + ' ';
          transcriptRef.current = finalTranscript;
        } else {
          interimTranscript += text;
        }
      }

      setState((prev) => ({
        ...prev,
        transcript: finalTranscript,
        interimTranscript,
      }));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        // Not a real error, just no speech detected
        return;
      }
      if (event.error === 'aborted') {
        return;
      }
      setState((prev) => ({
        ...prev,
        error:
          event.error === "not-allowed"
            ? "Microphone access was denied. Allow access in system/browser settings and try again."
            : event.error === "no-speech"
              ? "No speech detected. Try again."
              : `Speech recognition error: ${event.error}`,
      }));
    };

    recognition.onend = () => {
      // Auto-restart if should still be listening
      if (shouldRestartRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          // Recognition may already be started
        }
      } else {
        setState((prev) => ({ ...prev, isListening: false }));
      }
    };

    recognition.onstart = () => {
      setState((prev) => ({ ...prev, isListening: true, error: null }));
    };

    return recognition;
  }, [SpeechRecognitionAPI]);

  const startListening = useCallback((language?: string) => {
    if (!isSupported) {
      setState((prev) => ({
        ...prev,
        error: 'Speech recognition is not supported in this browser',
      }));
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
    }

    // Update language if provided
    if (language) {
      languageRef.current = language;
      setState((prev) => ({ ...prev, language }));
    }

    const recognition = createRecognition(language);
    if (!recognition) return;

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start speech recognition',
      }));
    }
  }, [isSupported, createRecognition]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    setState((prev) => ({ ...prev, isListening: false, interimTranscript: '' }));
  }, []);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = '';
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
    }));
  }, []);

  const setLanguage = useCallback((language: string) => {
    languageRef.current = language;
    setState((prev) => ({ ...prev, language }));
  }, []);

  // Demo mode: simulate speech input for testing
  const simulateInput = useCallback((text: string) => {
    transcriptRef.current += text + ' ';
    setState((prev) => ({
      ...prev,
      transcript: transcriptRef.current,
      interimTranscript: '',
    }));
  }, []);

  const startDemoMode = useCallback(() => {
    transcriptRef.current = '';
    setState((prev) => ({
      ...prev,
      isListening: true,
      isDemoMode: true,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));
  }, []);

  const stopDemoMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListening: false,
      isDemoMode: false,
      interimTranscript: '',
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  return {
    state,
    startListening,
    stopListening,
    resetTranscript,
    setLanguage,
    simulateInput,
    startDemoMode,
    stopDemoMode,
  };
}
