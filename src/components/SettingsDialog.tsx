import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Settings,
  Mic,
  Languages,
  Keyboard,
  User,
  Download,
  Check,
  Trash2,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Hand,
  MessageSquare,
  Edit3,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  Info,
  Shield,
  Bug,
  Cloud,
  FileText,
} from "lucide-react";

import { SUPPORTED_LANGUAGES } from "@/lib/text-processing";

import UserSettingsORM, {
  type UserSettingsModel,
  UserSettingsDictationMode,
} from "@/components/data/orm/orm_user_settings";
import KeyboardShortcutORM, {
  type KeyboardShortcutModel,
} from "@/components/data/orm/orm_keyboard_shortcut";
import DownloadedLanguageORM, {
  type DownloadedLanguageModel,
} from "@/components/data/orm/orm_downloaded_language";
import VoiceProfileORM, {
  type VoiceProfileModel,
} from "@/components/data/orm/orm_voice_profile";
import DictationCorrectionORM, {
  type DictationCorrectionModel,
} from "@/components/data/orm/orm_dictation_correction";
import PersonalDictionaryEntryORM, {
  type PersonalDictionaryEntryModel,
} from "@/components/data/orm/orm_personal_dictionary_entry";
import VoiceTrainingSampleORM from "@/components/data/orm/orm_voice_training_sample";
import { ReportProblemDialog } from "@/components/ReportProblemDialog";
import { getProfileStorage } from "@/lib/profile-storage";
import { getVersionInfo, getVersionString } from "@/lib/version";
import { ProfileLearningStore } from "@/lib/profile-learning-store";

interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

interface SettingsDialogProps {
  userId: string;
  onSettingsChange?: (settings: Partial<UserSettingsModel>) => void;
  trigger?: React.ReactNode;
}

const DEFAULT_SHORTCUTS = [
  { action: "start_dictation", label: "Start Dictation", defaultKey: "Ctrl+Shift+D" },
  { action: "stop_dictation", label: "Stop Dictation", defaultKey: "Ctrl+Shift+S" },
  { action: "toggle_mode", label: "Toggle Mode", defaultKey: "Ctrl+Shift+M" },
  { action: "clear_text", label: "Clear Text", defaultKey: "Ctrl+Shift+C" },
  { action: "copy_text", label: "Copy Text", defaultKey: "Ctrl+Shift+X" },
  { action: "correction_mode", label: "Correction Mode", defaultKey: "Ctrl+Shift+R" },
];

const DICTATION_MODES = [
  {
    value: UserSettingsDictationMode.press_to_talk,
    label: "Press-to-Talk",
    description: "Hold a key to speak, release to stop",
    icon: Hand,
  },
  {
    value: UserSettingsDictationMode.free_hand,
    label: "Free-Hand",
    description: "Continuous dictation without holding keys",
    icon: Mic,
  },
  {
    value: UserSettingsDictationMode.command,
    label: "Command Mode",
    description: "Speak commands for navigation and formatting",
    icon: MessageSquare,
  },
  {
    value: UserSettingsDictationMode.correction,
    label: "Correction Mode",
    description: "Review and fix dictation errors",
    icon: Edit3,
  },
];

export function SettingsDialog({ userId, onSettingsChange, trigger }: SettingsDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("microphone");
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SettingsDialog.tsx:149',message:'SettingsDialog render',data:{userId,hasTrigger:!!trigger,open,activeTab},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }, [userId, trigger, open, activeTab]);
  // #endregion
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [recordingShortcut, setRecordingShortcut] = useState<string | null>(null);
  const [newShortcutKey, setNewShortcutKey] = useState("");
  const [showReportProblem, setShowReportProblem] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);

  // ORM refs
  const userSettingsORMRef = useRef(UserSettingsORM.getInstance());
  const keyboardShortcutORMRef = useRef(KeyboardShortcutORM.getInstance());
  const downloadedLanguageORMRef = useRef(DownloadedLanguageORM.getInstance());
  const voiceProfileORMRef = useRef(VoiceProfileORM.getInstance());
  const dictationCorrectionORMRef = useRef(DictationCorrectionORM.getInstance());
  const personalDictionaryORMRef = useRef(PersonalDictionaryEntryORM.getInstance());
  const voiceTrainingSampleORMRef = useRef(VoiceTrainingSampleORM.getInstance());
  const profileStorageRef = useRef(getProfileStorage());

  // Fetch user settings
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["userSettings", userId],
    queryFn: async () => {
      try {
        const settings = await userSettingsORMRef.current.getUserSettingsByUserId(userId);
        return settings[0] || null;
      } catch {
        return null;
      }
    },
    enabled: open,
  });

  // Fetch keyboard shortcuts
  const { data: keyboardShortcuts = [] } = useQuery({
    queryKey: ["keyboardShortcuts", userId],
    queryFn: async () => {
      try {
        const shortcuts = await keyboardShortcutORMRef.current.getKeyboardShortcutByUserId(userId);
        return Array.isArray(shortcuts) ? shortcuts : [];
      } catch {
        return [];
      }
    },
    enabled: open,
  });

  // Fetch downloaded languages
  const { data: downloadedLanguages = [] } = useQuery({
    queryKey: ["downloadedLanguages", userId],
    queryFn: async () => {
      try {
        const languages = await downloadedLanguageORMRef.current.getDownloadedLanguageByUserId(userId);
        return Array.isArray(languages) ? languages : [];
      } catch {
        return [];
      }
    },
    enabled: open,
  });

  // Fetch voice profiles
  const { data: voiceProfiles = [] } = useQuery({
    queryKey: ["voiceProfiles", userId],
    queryFn: async () => {
      try {
        const profiles = await voiceProfileORMRef.current.getVoiceProfileByUserId(userId);
        return Array.isArray(profiles) ? profiles : [];
      } catch {
        return [];
      }
    },
    enabled: open,
  });

  // Fetch corrections for active profile
  const activeProfile = voiceProfiles.find((p) => p.is_active);
  const { data: corrections = [] } = useQuery({
    queryKey: ["corrections", activeProfile?.id],
    queryFn: async () => {
      if (!activeProfile?.id) return [];
      try {
        const allCorrections = await dictationCorrectionORMRef.current.getDictationCorrectionByProfileId(activeProfile.id);
        return Array.isArray(allCorrections) ? allCorrections : [];
      } catch {
        return [];
      }
    },
    enabled: open && !!activeProfile?.id,
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<UserSettingsModel>) => {
      if (userSettings) {
        await userSettingsORMRef.current.setUserSettingsById(userSettings.id, {
          ...userSettings,
          ...newSettings,
        });
      } else {
        await userSettingsORMRef.current.insertUserSettings([
          {
            user_id: userId,
            dictation_mode: UserSettingsDictationMode.free_hand,
            auto_clean_enabled: true,
            shortcuts_enabled: true,
            selected_language: "en-US",
            keyboard_mode_enabled: false,
            ...newSettings,
          } as UserSettingsModel,
        ]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
    },
  });

  // Save keyboard shortcut mutation
  const saveShortcutMutation = useMutation({
    mutationFn: async (data: { action: string; keyCombination: string }) => {
      const existing = keyboardShortcuts.find((s) => s.action === data.action);
      if (existing) {
        await keyboardShortcutORMRef.current.setKeyboardShortcutById(existing.id, {
          ...existing,
          key_combination: data.keyCombination,
        });
      } else {
        await keyboardShortcutORMRef.current.insertKeyboardShortcut([
          {
            user_id: userId,
            action: data.action,
            key_combination: data.keyCombination,
            is_enabled: true,
          } as KeyboardShortcutModel,
        ]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keyboardShortcuts"] });
      setRecordingShortcut(null);
      setNewShortcutKey("");
    },
  });

  // Download language mutation
  const downloadLanguageMutation = useMutation({
    mutationFn: async (lang: { code: string; name: string }) => {
      await downloadedLanguageORMRef.current.insertDownloadedLanguage([
        {
          user_id: userId,
          language_code: lang.code,
          language_name: lang.name,
          is_downloaded: true,
          download_progress: 100,
        } as DownloadedLanguageModel,
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloadedLanguages"] });
    },
  });

  // Delete language mutation
  const deleteLanguageMutation = useMutation({
    mutationFn: async (langId: string) => {
      await downloadedLanguageORMRef.current.deleteDownloadedLanguageById(langId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloadedLanguages"] });
    },
  });

  // Create profile mutation
  const createProfileMutation = useMutation({
    mutationFn: async (name: string) => {
      // Deactivate other profiles
      for (const profile of voiceProfiles) {
        if (profile.is_active) {
          await voiceProfileORMRef.current.setVoiceProfileById(profile.id, {
            ...profile,
            is_active: false,
          });
        }
      }
      await voiceProfileORMRef.current.insertVoiceProfile([
        {
          user_id: userId,
          name,
          training_samples_count: 0,
          voice_features: "{}",
          is_active: true,
        } as VoiceProfileModel,
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
    },
  });

  // Activate profile mutation
  const activateProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      for (const profile of voiceProfiles) {
        await voiceProfileORMRef.current.setVoiceProfileById(profile.id, {
          ...profile,
          is_active: profile.id === profileId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
    },
  });

  // Delete profile mutation
  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      await voiceProfileORMRef.current.deleteVoiceProfileById(profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
    },
  });

  // Apply correction mutation
  const applyCorrectionMutation = useMutation({
    mutationFn: async (correction: DictationCorrectionModel) => {
      await dictationCorrectionORMRef.current.setDictationCorrectionById(correction.id, {
        ...correction,
        is_applied: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
  });

  // Clear training data mutation
  const clearTrainingDataMutation = useMutation({
    mutationFn: async (profileId: string) => {
      if (!profileId) throw new Error("No profile selected");
      
      try {
        // Clear learning store
        const learningStore = ProfileLearningStore.getInstance(profileId, userId);
        await learningStore.clearLearning();

        // Clear training samples
        const trainingSamples = await voiceTrainingSampleORMRef.current.getVoiceTrainingSampleByProfileId(profileId);
        for (const sample of trainingSamples) {
          await voiceTrainingSampleORMRef.current.deleteVoiceTrainingSampleById(sample.id);
        }

        // Clear corrections
        const corrections = await dictationCorrectionORMRef.current.getDictationCorrectionByProfileId(profileId);
        for (const correction of corrections) {
          await dictationCorrectionORMRef.current.deleteDictationCorrectionById(correction.id);
        }

        // Reset training samples count
        const profile = await voiceProfileORMRef.current.getVoiceProfileById(profileId);
        if (profile[0] && profile[0].length > 0) {
          await voiceProfileORMRef.current.setVoiceProfileById(profileId, {
            ...profile[0][0],
            training_samples_count: 0,
          });
        }
      } catch (error) {
        console.error('Failed to clear training data:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voiceProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["personalDictionary"] });
      queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: (error) => {
      console.error('Clear training data error:', error);
    },
  });

  // Export profile mutation
  const exportProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      if (!profileId) throw new Error("No profile selected");

      try {
        // Load profile with all data
        const profile = await profileStorageRef.current.loadProfile(profileId);
        const dictionaryEntries = await personalDictionaryORMRef.current.getPersonalDictionaryEntryByProfileId(profileId);
        const trainingSamples = await voiceTrainingSampleORMRef.current.getVoiceTrainingSampleByProfileId(profileId);
        const corrections = await dictationCorrectionORMRef.current.getDictationCorrectionByProfileId(profileId);

        const exportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          profile: {
            id: profile.id,
            name: profile.name,
            training_samples_count: profile.training_samples_count,
            metadata: profile.metadata || {},
          },
          dictionaryEntries: dictionaryEntries.map((e) => ({
            original_text: e.original_text,
            replacement_text: e.replacement_text,
            entry_type: e.entry_type,
            is_enabled: e.is_enabled,
          })),
          trainingSamplesCount: trainingSamples.length,
          correctionsCount: corrections.length,
        };

        // Download as JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `speakorb-profile-${profile.name}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to export profile:', error);
        throw error;
      }
    },
    onError: (error) => {
      console.error('Export profile error:', error);
    },
  });

  // Get available microphones
  useEffect(() => {
    if (!open) return;

    async function getMicrophones() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          }));
        setMicrophones(audioInputs);
      } catch (err) {
        console.error("Error getting microphones:", err);
      }
    }
    getMicrophones();
  }, [open]);

  // Handle keyboard shortcut recording
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingShortcut) return;
      e.preventDefault();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Meta");

      if (e.key && !["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        parts.push(e.key.toUpperCase());
      }

      if (parts.length > 0) {
        setNewShortcutKey(parts.join("+"));
      }
    },
    [recordingShortcut]
  );

  useEffect(() => {
    if (recordingShortcut) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [recordingShortcut, handleKeyDown]);

  const handleSettingChange = (key: keyof UserSettingsModel, value: unknown) => {
    saveSettingsMutation.mutate({ [key]: value });
    onSettingsChange?.({ [key]: value });
  };

  const getShortcutForAction = (action: string) => {
    const shortcut = keyboardShortcuts.find((s) => s.action === action);
    return shortcut?.key_combination || DEFAULT_SHORTCUTS.find((s) => s.action === action)?.defaultKey || "";
  };

  const isLanguageDownloaded = (code: string) => {
    return downloadedLanguages.some((l) => l.language_code === code && l.is_downloaded);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your dictation preferences, shortcuts, and profile
          </DialogDescription>
          {/* Help Menu */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReportProblem(true)}
            className="absolute top-0 right-0 gap-2"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Report a Problem</span>
          </Button>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="microphone" className="gap-1.5">
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">Microphone</span>
            </TabsTrigger>
            <TabsTrigger value="languages" className="gap-1.5">
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">Languages</span>
            </TabsTrigger>
            <TabsTrigger value="shortcuts" className="gap-1.5">
              <Keyboard className="h-4 w-4" />
              <span className="hidden sm:inline">Shortcuts</span>
            </TabsTrigger>
            <TabsTrigger value="modes" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Modes</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-1.5">
              <Info className="h-4 w-4" />
              <span className="hidden sm:inline">About</span>
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Microphone Tab */}
            <TabsContent value="microphone" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Microphone Selection</CardTitle>
                  <CardDescription>Choose which microphone to use for dictation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {microphones.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span>No microphones detected. Please connect a microphone.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {microphones.map((mic) => (
                        <div
                          key={mic.deviceId}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            userSettings?.selected_microphone_id === mic.deviceId
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            handleSettingChange("selected_microphone_id", mic.deviceId);
                            handleSettingChange("selected_microphone_label", mic.label);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Mic className="h-4 w-4" />
                            <span>{mic.label}</span>
                          </div>
                          {userSettings?.selected_microphone_id === mic.deviceId && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.mediaDevices.enumerateDevices().then((devices) => {
                        const audioInputs = devices
                          .filter((d) => d.kind === "audioinput")
                          .map((d) => ({
                            deviceId: d.deviceId,
                            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
                          }));
                        setMicrophones(audioInputs);
                      });
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Devices
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Languages Tab */}
            <TabsContent value="languages" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Language Management</CardTitle>
                  <CardDescription>Download and manage language packs for offline use</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Downloaded Languages</Label>
                    {downloadedLanguages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No languages downloaded yet</p>
                    ) : (
                      <div className="space-y-2">
                        {downloadedLanguages.map((lang) => (
                          <div key={lang.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Check className="h-4 w-4 text-green-500" />
                              <span>{lang.language_name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {lang.language_code}
                              </Badge>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Language</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove {lang.language_name} from downloaded languages?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteLanguageMutation.mutate(lang.id)}>
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Available Languages</Label>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {SUPPORTED_LANGUAGES.filter((lang) => !isLanguageDownloaded(lang.code)).map((lang) => (
                          <div key={lang.code} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Languages className="h-4 w-4" />
                              <span>{lang.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {lang.code}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadLanguageMutation.mutate({ code: lang.code, name: lang.name })}
                              disabled={downloadLanguageMutation.isPending}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Shortcuts Tab */}
            <TabsContent value="shortcuts" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Keyboard Shortcuts</CardTitle>
                  <CardDescription>Customize keyboard shortcuts for dictation controls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {DEFAULT_SHORTCUTS.map((shortcut) => (
                      <div key={shortcut.action} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex-1">
                          <p className="font-medium">{shortcut.label}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {recordingShortcut === shortcut.action ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={newShortcutKey || "Press keys..."}
                                readOnly
                                className="w-40 text-center"
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (newShortcutKey) {
                                    saveShortcutMutation.mutate({
                                      action: shortcut.action,
                                      keyCombination: newShortcutKey,
                                    });
                                  }
                                }}
                                disabled={!newShortcutKey}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRecordingShortcut(null);
                                  setNewShortcutKey("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Badge variant="secondary" className="font-mono">
                                {getShortcutForAction(shortcut.action)}
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRecordingShortcut(shortcut.action);
                                  setNewShortcutKey("");
                                }}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Modes Tab */}
            <TabsContent value="modes" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dictation Modes</CardTitle>
                  <CardDescription>Choose how you want to control dictation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {DICTATION_MODES.map((mode) => {
                      const Icon = mode.icon;
                      const isSelected = userSettings?.dictation_mode === mode.value;
                      return (
                        <div
                          key={mode.value}
                          className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleSettingChange("dictation_mode", mode.value)}
                        >
                          <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                            <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : ""}`} />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{mode.label}</p>
                            <p className="text-sm text-muted-foreground">{mode.description}</p>
                          </div>
                          {isSelected && <Check className="h-5 w-5 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Correction Mode Section */}
              {userSettings?.dictation_mode === UserSettingsDictationMode.correction && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Correction Mode Settings</CardTitle>
                    <CardDescription>Review and correct dictation errors to improve accuracy</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {corrections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No corrections yet. Start dictating and make corrections to see them here.
                      </p>
                    ) : (
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-3">
                          {corrections.slice(0, 10).map((correction) => (
                            <div key={correction.id} className="p-3 rounded-lg border space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant={correction.is_applied ? "default" : "secondary"}>
                                  {correction.is_applied ? "Applied" : "Pending"}
                                </Badge>
                                {correction.original_audio_url && (
                                  <Button size="sm" variant="ghost">
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Spoken:</p>
                                  <p className="line-through text-red-500">{correction.spoken_text}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Corrected:</p>
                                  <p className="text-green-500">{correction.corrected_text}</p>
                                </div>
                              </div>
                              {!correction.is_applied && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => applyCorrectionMutation.mutate(correction)}
                                >
                                  Apply to Profile
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Voice Profiles</CardTitle>
                  <CardDescription>
                    Manage profiles that adapt to your voice and speech patterns
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {voiceProfiles.length === 0 ? (
                    <div className="text-center py-6">
                      <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">No voice profiles yet</p>
                      <Button onClick={() => createProfileMutation.mutate("Default Profile")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Profile
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {voiceProfiles.map((profile) => (
                        <div
                          key={profile.id}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            profile.is_active ? "border-primary bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${profile.is_active ? "bg-primary/10" : "bg-muted"}`}>
                              <User className={`h-4 w-4 ${profile.is_active ? "text-primary" : ""}`} />
                            </div>
                            <div>
                              <p className="font-medium">{profile.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {profile.training_samples_count} training samples
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {profile.is_active ? (
                              <Badge>Active</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => activateProfileMutation.mutate(profile.id)}
                              >
                                Activate
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Delete "{profile.name}"? This will remove all training data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteProfileMutation.mutate(profile.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => createProfileMutation.mutate(`Profile ${voiceProfiles.length + 1}`)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Profile
                      </Button>
                    </div>
                  )}

                  {activeProfile && (
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-2">Profile Statistics</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-muted-foreground">Training Samples</p>
                          <p className="text-2xl font-bold">{activeProfile.training_samples_count}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-muted-foreground">Corrections Applied</p>
                          <p className="text-2xl font-bold">{corrections.filter((c) => c.is_applied).length}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy Tab */}
            <TabsContent value="privacy" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Privacy & Data Controls</CardTitle>
                  <CardDescription>
                    Manage your data and privacy settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border bg-muted/20">
                      <p className="text-sm text-muted-foreground">
                        <Shield className="h-4 w-4 inline mr-2" />
                        Dictionary & training data is saved locally per profile. Your voice recordings and transcriptions are never sent to external servers.
                      </p>
                    </div>

                    {activeProfile && (
                      <>
                        <div className="space-y-2">
                          <Label>Active Profile: {activeProfile.name}</Label>
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SettingsDialog.tsx:1028',message:'Clear training data clicked',data:{profileId:activeProfile.id,profileName:activeProfile.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                // #endregion
                                if (confirm(`Clear all training data for "${activeProfile.name}"? This cannot be undone.`)) {
                                  // #region agent log
                                  fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SettingsDialog.tsx:1030',message:'Clear training data confirmed',data:{profileId:activeProfile.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                  // #endregion
                                  clearTrainingDataMutation.mutate(activeProfile.id);
                                }
                              }}
                              disabled={clearTrainingDataMutation.isPending}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Clear Training Data
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SettingsDialog.tsx:1039',message:'Export profile clicked',data:{profileId:activeProfile.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                // #endregion
                                exportProfileMutation.mutate(activeProfile.id);
                              }}
                              disabled={exportProfileMutation.isPending}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Export Profile
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="pt-4 border-t space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="cloud-sync">Cloud Sync</Label>
                          <p className="text-sm text-muted-foreground">
                            Sync your profiles across devices (coming soon)
                          </p>
                        </div>
                        <Switch
                          id="cloud-sync"
                          checked={cloudSyncEnabled}
                          onCheckedChange={setCloudSyncEnabled}
                          disabled={true}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About SpeakOrb</CardTitle>
                  <CardDescription>
                    Version information and system details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const versionInfo = getVersionInfo();
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">App Version</span>
                          <Badge variant="secondary">{getVersionString()}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Build Version</span>
                          <Badge variant="outline">{versionInfo.buildVersion}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Schema Version</span>
                          <Badge variant="outline">{versionInfo.schemaVersion}</Badge>
                        </div>
                        <div className="pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            SpeakOrb is a voice dictation application that learns from your corrections
                            to improve accuracy over time. All data is stored locally on your device.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Report Problem Dialog */}
        <ReportProblemDialog
          open={showReportProblem}
          onOpenChange={setShowReportProblem}
          activeProfileName={activeProfile?.name}
          activeProfileId={activeProfile?.id}
        />
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
