import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SettingsSelect } from "@/components/settings";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { useFileOpenHandlerCatalog } from "@/plugins/file-open";
import { settingsStyles } from "@/styles/settings";
import { BUILTIN_FILE_OPEN_HANDLER_ID } from "@/workspace/file-open";
import { SettingsSection } from "@/components/settings/headings/settings-section";

export function EditorSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const handlers = useFileOpenHandlerCatalog();
  const handleChange = useCallback(
    (vimKeybindings: boolean) => void updateSettings({ vimKeybindings }),
    [updateSettings],
  );
  const fileOpenOptions = useMemo(
    () => [
      { label: t("settings.editor.fileOpen.builtin"), value: BUILTIN_FILE_OPEN_HANDLER_ID },
      ...handlers.map((handler) => ({ label: handler.label, value: handler.id })),
    ],
    [handlers, t],
  );
  // A handler that is not installed here shows as the built-in pane, which is what the
  // app actually does with it; the stored id is left alone so reconnecting restores it.
  const fileOpenValue = fileOpenOptions.some(
    (option) => option.value === settings.fileOpenHandlerId,
  )
    ? settings.fileOpenHandlerId
    : BUILTIN_FILE_OPEN_HANDLER_ID;
  const handleFileOpenChange = useCallback(
    (fileOpenHandlerId: string) => void updateSettings({ fileOpenHandlerId }),
    [updateSettings],
  );
  return (
    <SettingsSection title={t("settings.editor.title")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.editor.vimKeybindings")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.editor.vimHint")}</Text>
          </View>
          <Switch
            value={settings.vimKeybindings}
            onValueChange={handleChange}
            accessibilityLabel={t("settings.editor.vimKeybindings")}
            testID="vim-keybindings-toggle"
          />
        </View>
        <View style={settingsStyles.rowBorder}>
          <SettingsSelect
            label={t("settings.editor.fileOpen.label")}
            hint={t("settings.editor.fileOpen.hint")}
            value={fileOpenValue}
            options={fileOpenOptions}
            onValueChange={handleFileOpenChange}
            testID="file-open-handler-select"
          />
        </View>
      </View>
    </SettingsSection>
  );
}
