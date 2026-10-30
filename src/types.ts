export type Unit = "pages" | "chapters";
export type Status = "reading" | "wishlist" | "paused" | "completed";
export type Mode = "deadline" | "pace";
export interface Entry {
  id: string;
  date: string;
  amount: number;
}
export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  total: number;
  pages: number;
  initial: number;
  unit: Unit;
  mode: Mode;
  pace: number;
  start: string;
  deadline: string;
  year: number;
  restDays: number[];
  excluded: string[];
  status: Status;
  tasks: Record<string, number>;
  entries: Entry[];
  completedAt?: string;
}
export interface Settings {
  goals: Record<string, number>;
  restDays: number[];
  unit: Unit;
  mode: Mode;
  pace: number;
}
export interface Data {
  version: 1;
  books: Book[];
  settings: Settings;
}
export const defaultSettings: Settings = {
  goals: {},
  restDays: [0],
  unit: "pages",
  mode: "deadline",
  pace: 10,
};
