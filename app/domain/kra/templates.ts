/** Helpers for working with per-template KRA sets. */

import type { KRAConfig } from "~/types/kra";
import type { KRATemplate } from "~/types/template";

/** All KRAs of one template, ordered. Pass `activeOnly` for reporting/entry. */
export function krasForTemplate(kras: KRAConfig[], templateId: string, activeOnly = false): KRAConfig[] {
  return kras
    .filter((k) => k.templateId === templateId && (!activeOnly || k.active))
    .sort((a, b) => a.order - b.order);
}

export function groupByTemplate<T extends { templateId: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.templateId) ?? [];
    list.push(item);
    groups.set(item.templateId, list);
  }
  return groups;
}

export function templateName(templates: KRATemplate[], id: string): string {
  return templates.find((t) => t.id === id)?.name ?? "Unknown template";
}
