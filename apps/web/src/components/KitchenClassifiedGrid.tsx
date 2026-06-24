import type { ClassifiedGroup } from "@/lib/catalog-classification";

type Props<T> = {
  groups: ClassifiedGroup<T>[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  itemLabel?: (count: number) => string;
  subgroupTitlePrefix?: string;
};

export function KitchenClassifiedGrid<T>({
  groups,
  renderItem,
  emptyMessage,
  itemLabel = (count) => `${count} item${count === 1 ? "" : "s"}`,
  subgroupTitlePrefix,
}: Props<T>) {
  const total = groups.reduce(
    (sum, group) => sum + group.subclasses.reduce((s, sub) => s + sub.items.length, 0),
    0
  );

  if (total === 0) {
    return <p className="text-sm text-chef-text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.classKey}>
          <h3 className="text-base font-semibold text-chef-text">{group.classLabel}</h3>
          <div className="mt-3 space-y-5">
            {group.subclasses.map((subclass) => (
              <div key={`${group.classKey}:${subclass.subclassKey}`}>
                {group.subclasses.length > 1 || subclass.subclassKey !== group.classKey ? (
                  <h4 className="text-sm font-medium text-chef-text-muted">
                    {subgroupTitlePrefix
                      ? `${subgroupTitlePrefix}: ${subclass.subclassLabel}`
                      : subclass.subclassLabel}
                  </h4>
                ) : null}
                <div
                  className={`flex flex-wrap gap-3 ${
                    group.subclasses.length > 1 || subclass.subclassKey !== group.classKey
                      ? "mt-2"
                      : ""
                  }`}
                >
                  {subclass.items.map((item) => (
                    <div key={(item as { slug?: string }).slug ?? String(item)}>
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-chef-text-muted">
                  {itemLabel(subclass.items.length)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
