// Validation for a member resource (a shared link/document). Pure — reused by the
// web admin form and mirrored on the mobile read side.

export const RESOURCE_CATEGORIES = ['Guide', 'Form', 'Template', 'Link', 'Video', 'Other'] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export interface ResourceInput {
  title?: string | null;
  url?: string | null;
  category?: string | null;
  description?: string | null;
}

export interface ResourceValidation {
  ok: boolean;
  error?: string;
}

export function validateResourceInput(input: ResourceInput): ResourceValidation {
  const title = (input.title ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };
  if (title.length > 200) return { ok: false, error: 'Title is too long (max 200).' };

  const url = (input.url ?? '').trim();
  if (url) {
    if (url.length > 2048) return { ok: false, error: 'Link is too long.' };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Link must start with http:// or https://.' };
  }

  const category = (input.category ?? '').trim();
  if (category && !RESOURCE_CATEGORIES.includes(category as ResourceCategory)) {
    return { ok: false, error: 'Unknown category.' };
  }
  return { ok: true };
}
