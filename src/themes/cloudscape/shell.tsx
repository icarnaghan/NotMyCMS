/**
 * The Cloudscape shell: top navigation with search, cookies and settings utilities, the
 * cookie notice, and the search modal, followed by the routed page.
 */
import { useState } from "react";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { TEXT_SIZES, textSizeLabel, type TextSizePreference } from "../../lib/text-size";
import type { ColorMode, ShellView } from "../types";
import { SearchModal } from "./search-modal";

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function Shell({
  siteTitle,
  nav,
  settings,
  capabilities,
  search,
  goTo,
  children,
}: ShellView) {
  const [cookiesVisible, setCookiesVisible] = useState(false);
  return (
    <>
      <TopNavigation
        i18nStrings={{
          overflowMenuTriggerText: "More",
          overflowMenuTitleText: "All",
        }}
        identity={{
          href: "/",
          title: siteTitle,
          onFollow: (e) => {
            e.preventDefault();
            goTo("/");
          },
        }}
        utilities={[
          ...nav.map(({ label, to }) => ({
            type: "button" as const,
            text: label,
            onClick: () => goTo(to),
          })),
          // The remaining utilities are behavioural, not navigational.
          {
            type: "button",
            iconName: "search",
            ariaLabel: "Search",
            onClick: search.onOpen,
          },
          {
            type: "button",
            iconName: "lock-private",
            ariaLabel: "Cookies Policy",
            onClick: () => setCookiesVisible(true),
          },
          {
            type: "menu-dropdown",
            iconName: "settings",
            ariaLabel: "Settings",
            title: "Settings",
            items: [
              {
                // "Color mode", not "Theme": a theme is the visual design (Cloudscape,
                // Tailwind). The id and storage key keep the older name.
                id: "theme",
                text: "Color mode",
                items: capabilities.colorModes.map((mode) => ({
                  id: `theme-${mode}`,
                  text: COLOR_MODE_LABELS[mode],
                  itemType: "checkbox" as const,
                  checked: settings.colorMode === mode,
                })),
              },
              ...(capabilities.density
                ? [
                    {
                      id: "density",
                      text: "Density",
                      items: [
                        {
                          id: "density-comfortable",
                          text: "Comfortable",
                          itemType: "checkbox" as const,
                          checked: settings.density === "comfortable",
                        },
                        {
                          id: "density-compact",
                          text: "Compact",
                          itemType: "checkbox" as const,
                          checked: settings.density === "compact",
                        },
                      ],
                    },
                  ]
                : []),
              ...(capabilities.textSize
                ? [
                    {
                      id: "text-size",
                      text: "Text size",
                      items: TEXT_SIZES.map((size) => ({
                        id: `text-size-${size}`,
                        text: textSizeLabel(size),
                        itemType: "checkbox" as const,
                        checked: settings.textSize === size,
                      })),
                    },
                  ]
                : []),
              {
                id: "privacy",
                text: "Privacy",
                items: [
                  {
                    id: "analytics-opt-out",
                    text: "Don't track my visits",
                    itemType: "checkbox" as const,
                    checked: settings.analyticsOptOut,
                  },
                ],
              },
            ],
            onItemClick: ({ detail }) => {
              const { id } = detail;
              if (id.startsWith("theme-")) {
                settings.onColorModeChange(id.slice("theme-".length) as ColorMode);
              } else if (id === "density-comfortable") {
                settings.onDensityChange("comfortable");
              } else if (id === "density-compact") {
                settings.onDensityChange("compact");
              } else if (id.startsWith("text-size-")) {
                settings.onTextSizeChange(id.slice("text-size-".length) as TextSizePreference);
              } else if (id === "analytics-opt-out") {
                settings.onAnalyticsOptOutChange(!settings.analyticsOptOut);
              }
            },
          },
        ]}
      />
      <Modal
        visible={cookiesVisible}
        onDismiss={() => setCookiesVisible(false)}
        header="Cookies Policy"
        closeAriaLabel="Close"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setCookiesVisible(false)}>
              Close
            </Button>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box variant="p">
            This site uses cookies - small text files that are placed on your machine to help the
            site provide a better user experience. In general, cookies are used to retain user
            preferences, store information for things like shopping carts, and provide anonymised
            tracking data to third party applications like Google Analytics. As a rule, cookies will
            make your browsing experience better. However, you may prefer to disable cookies on this
            site and on others. The most effective way to do this is to disable cookies in your
            browser. We suggest consulting the Help section of your browser or taking a look at the
            About Cookies website which offers guidance for all modern browsers
          </Box>
        </SpaceBetween>
      </Modal>
      <SearchModal search={search} />
      {children}
    </>
  );
}
