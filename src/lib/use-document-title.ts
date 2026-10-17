import { useEffect } from "react";
import { siteConfig } from "./site-config";

/**
 * Updates the browser tab title. Pass a page-specific title and it renders as
 * "Page Title | {siteName}". Pass nothing for just the site name.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const siteName = siteConfig.siteName;
    document.title = title ? `${title} | ${siteName}` : siteName;
    return () => {
      document.title = siteName;
    };
  }, [title]);
}
