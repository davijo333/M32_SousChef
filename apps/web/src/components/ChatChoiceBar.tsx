"use client";

import { renderChatMarkdown } from "@/lib/chat-markdown";
import type { ChatChoice, ChatChoiceSet } from "@backend/services/chat/chat-choices";

type ChatChoiceBarProps = {
  choiceSet: ChatChoiceSet;
  disabled?: boolean;
  onSelect: (choice: ChatChoice) => void;
};

export function ChatChoiceBar({ choiceSet, disabled, onSelect }: ChatChoiceBarProps) {
  if (!choiceSet.choices.length) return null;

  return (
    <div className="mt-2 max-w-[85%] space-y-2">
      {choiceSet.prompt ? (
        <div className="text-xs font-medium text-chef-text-muted">
          {renderChatMarkdown(choiceSet.prompt)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reply options">
        {choiceSet.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(choice)}
            title={choice.description}
            className="rounded-full border border-chef-border bg-white px-3 py-1.5 text-left text-xs text-chef-text transition-colors hover:border-chef-sage hover:bg-chef-sage hover:text-white disabled:opacity-50"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
