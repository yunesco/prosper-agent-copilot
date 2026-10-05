import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prosper Agent Builder',
  description: 'Build and improve healthcare scheduling agents.',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  interactiveWidget: 'resizes-content', themeColor: '#ffffff', colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="m-0 bg-workspace font-sans text-base-content antialiased overscroll-none [scrollbar-color:var(--ui-border-strong)_transparent] selection:bg-accent-soft selection:text-base-content">{children}</body></html>;
}
