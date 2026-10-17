import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Box from "@cloudscape-design/components/box";
import { useSettings } from "../../lib/settings-context";
import type { DensityPreference, ThemePreference } from "../../lib/settings-preferences";

export default function SettingsPage() {
  const { theme, density, resolvedTheme, setTheme, setDensity } = useSettings();

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Appearance preferences are stored in this browser and shared with the public site."
      >
        Settings
      </Header>

      <Container header={<Header variant="h2">Appearance</Header>}>
        <SpaceBetween size="l">
          <FormField
            label="Theme"
            description={
              theme === "system"
                ? `Following your device preference (currently ${resolvedTheme}).`
                : "Overrides your device preference."
            }
          >
            <RadioGroup
              value={theme}
              onChange={({ detail }) => setTheme(detail.value as ThemePreference)}
              items={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </FormField>

          <FormField label="Density" description="Compact reduces spacing to fit more on screen.">
            <RadioGroup
              value={density}
              onChange={({ detail }) => setDensity(detail.value as DensityPreference)}
              items={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Privacy</Header>}>
        <Box variant="p" color="text-body-secondary">
          The admin dashboard has no analytics or tracking. The public site offers a "Don't track my
          visits" option in its Settings menu.
        </Box>
      </Container>
    </SpaceBetween>
  );
}
