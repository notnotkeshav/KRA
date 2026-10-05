export type Employee = {
  id: string;
  name: string;
  employeeCode?: string;
  designation?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeInput = {
  name: string;
  employeeCode?: string;
  designation?: string;
};
