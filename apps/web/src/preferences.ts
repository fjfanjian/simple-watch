export interface AudioPreferences {
  programVolume: number;
  callVolume: number;
  inputDeviceId: string;
  pushToTalk: boolean;
  autoDuck: boolean;
  participantVolumes: Record<string, number>;
}

const key = "simplewatch.audio-preferences.v1";
const defaults: AudioPreferences = {
  programVolume: 100,
  callVolume: 100,
  inputDeviceId: "",
  pushToTalk: false,
  autoDuck: false,
  participantVolumes: {},
};

export function loadPreferences(): AudioPreferences {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key) ?? "null",
    ) as Partial<AudioPreferences> | null;
    return {
      ...defaults,
      ...parsed,
      participantVolumes: parsed?.participantVolumes ?? {},
    };
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(preferences: AudioPreferences): void {
  localStorage.setItem(key, JSON.stringify(preferences));
}
