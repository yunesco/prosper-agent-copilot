import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prosper Agent Builder',
  description: 'Build and improve healthcare scheduling agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
