import type { KRAConfig } from "~/types/kra";
import type { KRATemplate } from "~/types/template";
import { generateId } from "~/utils/dates";
import { DatabaseError, STORES, getAll, req, withTx } from "../indexeddb";

const S = STORES.templates;

export async function getTemplates(): Promise<KRATemplate[]> {
  const all = await getAll<KRATemplate>(S);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new DatabaseError("invalid", "Template name must be at least 2 characters.");
  return trimmed;
}

/** Creates a template, copying the KRAs of `copyFromId` (with fresh ids) so it starts valid (total 100). */
export async function createTemplate(input: { name: string; description?: string; copyFromId: string }): Promise<KRATemplate> {
  const name = cleanName(input.name);
  return withTx([S, STORES.kraConfig], "readwrite", async (s) => {
    const templates = await req(s[S].getAll() as IDBRequest<KRATemplate[]>);
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new DatabaseError("invalid", `A template named "${name}" already exists.`);
    }
    const source = templates.find((t) => t.id === input.copyFromId);
    if (!source) throw new DatabaseError("not-found", "The template to copy from was not found.");

    const now = new Date().toISOString();
    const template: KRATemplate = {
      id: generateId(),
      name,
      description: input.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await req(s[S].add(template));

    const kras = await req(s[STORES.kraConfig].index("templateId").getAll(source.id) as IDBRequest<KRAConfig[]>);
    for (const k of kras) {
      await req(s[STORES.kraConfig].add({ ...k, id: generateId(), templateId: template.id, createdAt: now, updatedAt: now }));
    }
    return template;
  });
}

export async function renameTemplate(id: string, input: { name: string; description?: string }): Promise<KRATemplate> {
  const name = cleanName(input.name);
  return withTx([S], "readwrite", async (s) => {
    const all = await req(s[S].getAll() as IDBRequest<KRATemplate[]>);
    const existing = all.find((t) => t.id === id);
    if (!existing) throw new DatabaseError("not-found", "Template not found.");
    if (all.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) {
      throw new DatabaseError("invalid", `A template named "${name}" already exists.`);
    }
    const updated: KRATemplate = { ...existing, name, description: input.description?.trim() || undefined, updatedAt: new Date().toISOString() };
    await req(s[S].put(updated));
    return updated;
  });
}

/** Deletes an unused template and its KRAs. Refused while any employee is assigned or if it is the last one. */
export async function deleteTemplate(id: string): Promise<void> {
  await withTx([S, STORES.kraConfig, STORES.employees], "readwrite", async (s) => {
    const count = await req(s[S].count());
    if (count <= 1) throw new DatabaseError("invalid", "At least one template must remain.");
    const employees = await req(s[STORES.employees].getAll() as IDBRequest<{ templateId: string }[]>);
    const used = employees.filter((e) => e.templateId === id).length;
    if (used > 0) throw new DatabaseError("invalid", `${used} employee(s) use this template. Move them to another template first.`);
    const kras = await req(s[STORES.kraConfig].index("templateId").getAllKeys(id));
    for (const key of kras) await req(s[STORES.kraConfig].delete(key));
    await req(s[S].delete(id));
  });
}
