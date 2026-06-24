"use client";

import { useEffect, useState } from "react";

type Props = {
  name: string;
  imageUrl?: string;
  selected?: boolean;
  inProgress?: boolean;
  onClick: () => void;
};

function TileImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-chef-muted text-3xl text-chef-text-muted/40">
        🍽
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function RecipeTile({ name, imageUrl, selected, inProgress, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[11.5rem] shrink-0 flex-col overflow-hidden rounded-xl border text-left transition sm:w-[12.5rem] ${
        selected
          ? "border-chef-sage ring-2 ring-chef-sage/30"
          : "border-chef-border hover:border-chef-sage/50"
      } ${inProgress ? "ring-2 ring-chef-sage/40" : ""}`}
    >
      <div className="aspect-square w-full shrink-0 overflow-hidden bg-chef-muted">
        <TileImage src={imageUrl} alt={name} />
      </div>
      <p className="line-clamp-2 px-2.5 py-2 text-sm font-semibold leading-snug text-chef-text">
        {name}
      </p>
    </button>
  );
}
