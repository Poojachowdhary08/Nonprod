import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionOptions,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

type Listener = { remove: () => void };

type UseSpeechToTextOptions = {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  stopOnFinal?: boolean;
  dedupeFinal?: boolean;
  unavailableMessage?: string;
  permissionDeniedMessage?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onFinalTranscript?: (text: string, event: ExpoSpeechRecognitionResultEvent) => void;
  onPartialTranscript?: (text: string, event: ExpoSpeechRecognitionResultEvent) => void;
  onError?: (message: string, event?: ExpoSpeechRecognitionErrorEvent | null) => void;
};

const DEFAULT_UNAVAILABLE_MESSAGE =
  "Speech recognition is not available on this device or browser.";
const DEFAULT_PERMISSION_DENIED_MESSAGE =
  "Please allow microphone and speech-recognition access.";

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const optionsRef = useRef(options);
  const listenersRef = useRef<Listener[]>([]);
  const lastFinalRef = useRef("");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const clearListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener.remove();
      } catch {}
    });
    listenersRef.current = [];
  }, []);

  const stopListening = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}

    clearListeners();
    lastFinalRef.current = "";
    setIsListening(false);
  }, [clearListeners]);

  const bindListeners = useCallback(() => {
    clearListeners();

    listenersRef.current = [
      ExpoSpeechRecognitionModule.addListener("start", () => {
        setIsListening(true);
        optionsRef.current.onStart?.();
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        setIsListening(false);
        optionsRef.current.onEnd?.();
        clearListeners();
      }),
      ExpoSpeechRecognitionModule.addListener("error", (event) => {
        setIsListening(false);
        clearListeners();
        const message =
          String(event?.message || "").trim() ||
          String(event?.error || "").trim() ||
          "Could not start voice input.";
        optionsRef.current.onError?.(message, event);
      }),
      ExpoSpeechRecognitionModule.addListener("result", (event) => {
        const transcript = event.results
          .map((result: { transcript?: string }) => String(result?.transcript || "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();

        if (!transcript) return;

        if (event.isFinal) {
          if (optionsRef.current.dedupeFinal !== false && transcript === lastFinalRef.current) {
            return;
          }

          lastFinalRef.current = transcript;
          optionsRef.current.onFinalTranscript?.(transcript, event);

          if (optionsRef.current.stopOnFinal) {
            void stopListening();
          }
          return;
        }

        optionsRef.current.onPartialTranscript?.(transcript, event);
      }),
    ];
  }, [clearListeners, stopListening]);

  const startListening = useCallback(
    async (overrideOptions: Partial<ExpoSpeechRecognitionOptions> = {}) => {
      lastFinalRef.current = "";

      if (
        typeof ExpoSpeechRecognitionModule.isRecognitionAvailable === "function" &&
        !ExpoSpeechRecognitionModule.isRecognitionAvailable()
      ) {
        optionsRef.current.onError?.(
          optionsRef.current.unavailableMessage || DEFAULT_UNAVAILABLE_MESSAGE,
          null
        );
        return false;
      }

      try {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission?.granted) {
          optionsRef.current.onError?.(
            optionsRef.current.permissionDeniedMessage || DEFAULT_PERMISSION_DENIED_MESSAGE,
            null
          );
          return false;
        }

        bindListeners();
        ExpoSpeechRecognitionModule.start({
          lang: optionsRef.current.lang || "en-IN",
          continuous: optionsRef.current.continuous ?? false,
          interimResults: optionsRef.current.interimResults ?? true,
          ...overrideOptions,
        });
        return true;
      } catch (error: any) {
        clearListeners();
        setIsListening(false);
        optionsRef.current.onError?.(
          String(error?.message || error || "Could not start voice input."),
          null
        );
        return false;
      }
    },
    [bindListeners, clearListeners]
  );

  useEffect(() => {
    return () => {
      clearListeners();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    };
  }, [clearListeners]);

  return {
    isListening,
    startListening,
    stopListening,
  };
}
