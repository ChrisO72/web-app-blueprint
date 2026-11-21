import { useState } from "react";

export function useDetailsSelection<T>(entities: T[], identity: (entity: T) => string | number) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selected = entities.find((entity) => identity(entity) === selectedId);
  return {
    selected,
    open: isOpen && selected !== undefined,
    select: (entity: T) => {
      setSelectedId(identity(entity));
      setIsOpen(true);
    },
    close: () => setIsOpen(false),
  };
}
