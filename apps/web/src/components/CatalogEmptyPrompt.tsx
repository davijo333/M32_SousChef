import Link from "next/link";

type Props = {
  title: string;
  description: string;
};

export function CatalogEmptyPrompt({ title, description }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-chef-amber/30 bg-chef-amber-light/40 p-6">
      <h2 className="font-semibold text-chef-text">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-chef-text-muted">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/upload-orders" className="sc-btn-primary text-sm">
          Upload orders
        </Link>
        <Link href="/dashboard" className="sc-btn-secondary text-sm">
          Load demo or dashboard
        </Link>
      </div>
    </div>
  );
}
