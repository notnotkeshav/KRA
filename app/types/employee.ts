export type Employee = {
  id: string;
  name: string;
  templateId: string;
  employeeCode?: string;
  designation?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeInput = {
  name: string;
  templateId: string;
  employeeCode?: string;
  designation?: string;
};
