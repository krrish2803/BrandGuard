import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrandGuard — Pre-Publication Brand Governance Platform",
  description:
    "Pre-publication brand governance that explains, suggests, and keeps humans in control. Citation-grounded guideline enforcement, living facts, and verified rewrites.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
