import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import {
  getDateLocale,
  getIntlLocale,
  setLanguage,
  translate,
} from "../src/i18n";
import { messages } from "../src/translations";
import { pretty } from "../src/engine";

afterEach(() => setLanguage("ru"));

describe("app translations", () => {
  it("covers every app message and preserves interpolation placeholders", () => {
    for (const file of readdirSync("src").filter(
      (name) => /\.tsx?$/.test(name) && name !== "translations.ts",
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(`src/${file}`, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "translate" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text.replace(/\s+/g, " ").trim();
          expect(messages[key], `${file}: ${key}`).toBeDefined();
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
    for (const [source, translations] of Object.entries(messages)) {
      for (const language of ["en", "pl"] as const) {
        expect(
          translations[language].trim(),
          `${language}: ${source}`,
        ).not.toBe("");
        expect(
          placeholders(translations[language]),
          `${language}: ${source}`,
        ).toEqual(placeholders(source));
      }
    }
  });

  it("changes date formatting and preserves literal user content during interpolation", () => {
    setLanguage("en");
    expect(translate("Открыть {0}", ["Моя история $& {1}"])).toBe(
      "Open Моя история $& {1}",
    );
    expect(pretty("2026-10-31", true)).toContain("October");
    expect(getDateLocale().code).toBe("en-GB");
    setLanguage("pl");
    expect(pretty("2026-10-31", true)).toContain("października");
    expect(getIntlLocale()).toBe("pl-PL");
    setLanguage("ru");
    expect(translate("Цель на {0} год", [2026])).toBe("Цель на 2026 год");
  });
});
