import type { ReactNode } from "react";
import { Subheading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-6 py-8 sm:grid-cols-2 sm:gap-8" aria-label={title}>
      <div>
        <Subheading>{title}</Subheading>
        <Text className="mt-1">{description}</Text>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
