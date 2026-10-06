import type { ReactNode } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { focusRing } from '@/components/ui/focus';

const appScheme = /^(call|graph):/;

/**
 * Model-authored Markdown, without HTML or remote media. `call:` and `graph:`
 * links are in-app evidence references: they render only through `resolveLink`,
 * which decides whether the reference is real; otherwise they stay plain text.
 */
export function MarkdownContent({
  children,
  resolveLink,
}: {
  children: string;
  resolveLink?: (href: string, label: ReactNode) => ReactNode;
}) {
  return (
    <div
      dir="auto"
      className="min-w-0 max-w-prose text-sm leading-6 [overflow-wrap:anywhere] [&_p+p]:mt-3 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-medium [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l [&_blockquote]:border-ui-border-strong [&_blockquote]:pl-3 [&_table]:w-full [&_td]:border-b [&_td]:border-ui-border [&_td]:p-2 [&_th]:p-2 [&_th]:text-left"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={url => (appScheme.test(url) ? url : defaultUrlTransform(url))}
        components={{
          // No remote media requests from model-authored Markdown.
          img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
          a: ({ href, children }) =>
            href && appScheme.test(href) ? (
              <>{resolveLink?.(href, children) ?? children}</>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-accent-text underline underline-offset-4 ${focusRing}`}
              >
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div
              className="max-w-full overflow-x-auto"
              role="region"
              aria-label="Response table"
              tabIndex={0}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
