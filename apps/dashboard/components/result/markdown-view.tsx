import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Styled via `.markdown-body` in globals.css rather than a typography plugin — one less dependency for a few element rules. */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
