import AppLayout from "@cloudscape-design/components/app-layout";
import { type ReactNode } from "react";

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return <AppLayout content={children} navigationHide toolsHide />;
}
