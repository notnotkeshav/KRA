/** A KRA template is a named set of KRAs (weights total 100) assigned to employees by role. */
export type KRATemplate = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export const DEVELOPER_TEMPLATE_ID = "template-developer";
export const FUNCTIONAL_TEMPLATE_ID = "template-functional";
/** Records created before templates existed belong to the developer template. */
export const DEFAULT_TEMPLATE_ID = DEVELOPER_TEMPLATE_ID;
