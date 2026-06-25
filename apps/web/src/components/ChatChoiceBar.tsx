"use client";

import { renderChatMarkdown } from "@/lib/chat-markdown";
import type { ChatChoice, ChatChoiceSet } from "@backend/services/chat/chat-choices";

type ChatChoiceBarProps = {
  choiceSet: ChatChoiceSet;
  disabled?: boolean;
  onSelect: (choice: ChatChoice) => void;
};

function choiceButtonClass(choice: ChatChoice): string {
  const base =
    "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
  if (choice.id.includes("confirm") || choice.id === "full_build") {
    return `${base} border border-chef-sage bg-chef-sage text-white hover:bg-chef-sage/90`;
  }
  if (choice.id.includes("cancel") || choice.id === "later") {
    return `${base} border border-chef-border bg-white text-chef-text-muted hover:border-chef-text-muted`;
  }
  return `${base} border border-chef-border bg-white text-chef-text hover:border-chef-sage hover:bg-chef-sage-light/30`;
}

export function ChatChoiceBar({ choiceSet, disabled, onSelect }: ChatChoiceBarProps) {
  if (!choiceSet.choices.length) return null;

  return (
    <div className="mt-3 max-w-[85%] space-y-2">
      {choiceSet.prompt ? (
        <div className="text-sm font-medium text-chef-text">
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
            className={choiceButtonClass(choice)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
