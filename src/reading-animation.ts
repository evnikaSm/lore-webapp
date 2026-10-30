import { createContext } from "react";
import type { Book } from "./types";
export interface ReadingAnimation {
  book: Book;
  token: string;
  active: boolean;
  before: number;
  message: string;
}
export const ReadingAnimationContext = createContext<ReadingAnimation | null>(
  null,
);
