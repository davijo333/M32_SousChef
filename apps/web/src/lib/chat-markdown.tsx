import { Fragment, type ReactNode } from "react";

const BOLD_PATTERN = /(\*\*[^*]+\*\*)/g;

/** Render `**bold**` segments in chat copy; preserves newlines. */
export function renderChatMarkdown(text: string): ReactNode[] {
  return text.split(BOLD_PATTERN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
