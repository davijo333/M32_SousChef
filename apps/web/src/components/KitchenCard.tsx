"use client";

import { useEffect, useState } from "react";

function KitchenImage({ src, alt }: { src?: string; alt: string }) {
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

type Props = {
  name: string;
  imageUrl?: string;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
};

export function KitchenCard({ name, imageUrl, subtitle, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition sm:w-40 ${
        selected
          ? "border-chef-sage ring-2 ring-chef-sage/30"
          : "border-chef-border hover:border-chef-sage/50"
      }`}
    >
      <div className="aspect-square w-full overflow-hidden bg-chef-muted">
        <KitchenImage src={imageUrl} alt={name} />
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-chef-text">{name}</p>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-chef-text-muted">{subtitle}</p>}
      </div>
    </button>
  );
}
