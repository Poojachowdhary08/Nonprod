declare module "expo-speech-recognition" {
  export type ExpoSpeechRecognitionResult = {
    transcript: string;
    confidence: number;
    segments: Array<{
      startTimeMillis: number;
      endTimeMillis: number;
      segment: string;
      confidence: number;
    }>;
  };

  export type ExpoSpeechRecognitionResultEvent = {
    isFinal: boolean;
    results: ExpoSpeechRecognitionResult[];
  };

  export type ExpoSpeechRecognitionErrorEvent = {
    error: string;
    message: string;
    code?: number;
  };

  export type ExpoSpeechRecognitionOptions = {
    lang?: string;
    interimResults?: boolean;
    continuous?: boolean;
    maxAlternatives?: number;
    addsPunctuation?: boolean;
    requiresOnDeviceRecognition?: boolean;
  };

  export type ExpoSpeechRecognitionPermissionResponse = {
    granted: boolean;
    canAskAgain?: boolean;
    status?: string;
    expires?: string;
  };

  export const ExpoSpeechRecognitionModule: {
    start(options: ExpoSpeechRecognitionOptions): void;
    stop(): void;
    abort(): void;
    requestPermissionsAsync(): Promise<ExpoSpeechRecognitionPermissionResponse>;
    getPermissionsAsync(): Promise<ExpoSpeechRecognitionPermissionResponse>;
    isRecognitionAvailable(): boolean;
    addListener(
      eventName: "start" | "end" | "error" | "result",
      listener: (event: any) => void
    ): { remove: () => void };
  };
}
