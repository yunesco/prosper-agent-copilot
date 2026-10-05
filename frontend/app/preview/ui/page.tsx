import { notFound } from 'next/navigation';
import { UiPreview } from '@/components/preview/UiPreview';

// Explicit build-time opt-in for deterministic component QA; absent in normal builds.
export default function PreviewPage() {
  if (process.env.UI_PREVIEW !== '1') notFound();
  return <UiPreview />;
}
