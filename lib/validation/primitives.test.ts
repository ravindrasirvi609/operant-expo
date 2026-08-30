import { describe, expect, it } from "vitest";

import {
  currencyField,
  emailField,
  nonNegativeNumber,
  optionalText,
  positiveNumber,
  slugField,
  slugify,
} from "@/lib/validation/primitives";

function messageFor(schema: { safeParse: (input: unknown) => { success: boolean; error?: unknown } }, input: unknown) {
  const parsed = schema.safeParse(input) as { success: boolean; error?: { issues: { message: string }[] } };
  if (parsed.success) throw new Error("expected the schema to reject this input");
  return parsed.error!.issues[0].message;
}

describe("slugField", () => {
  it("accepts lowercase hyphenated words", () => {
    expect(slugField.parse("spring-trade-expo-2027")).toBe("spring-trade-expo-2027");
  });

  it("explains the rule instead of failing silently", () => {
    // The API used to answer any bad slug with "Valid name and slug are required".
    expect(messageFor(slugField, "Spring Expo")).toContain("lowercase letters, numbers and single hyphens");
  });

  it("rejects leading, trailing and doubled hyphens", () => {
    for (const value of ["-expo", "expo-", "spring--expo"]) {
      expect(() => slugField.parse(value)).toThrow();
    }
  });
});

describe("slugify", () => {
  it("builds a valid slug from a display name", () => {
    expect(slugify("Spring Trade Expo 2027")).toBe("spring-trade-expo-2027");
    expect(slugField.safeParse(slugify("Spring Trade Expo 2027")).success).toBe(true);
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("Acme & Co. -- Expo!!")).toBe("acme-co-expo");
  });

  it("folds accents so an accented name still yields an ASCII slug", () => {
    expect(slugify("Münchner Messe")).toBe("munchner-messe");
  });

  it("produces output the slug rule accepts, for any of these names", () => {
    for (const name of ["Expo 2027", "  padded  ", "Ünïcödé Expo", "A---B"]) {
      const slug = slugify(name);
      expect(slugField.safeParse(slug).success, `${name} -> ${slug}`).toBe(true);
    }
  });
});

describe("currencyField", () => {
  it("normalises to uppercase", () => {
    expect(currencyField.parse("inr")).toBe("INR");
  });

  it("rejects the wrong length with a usable example", () => {
    expect(messageFor(currencyField, "RUPEES")).toContain("INR or USD");
  });

  it("rejects digits", () => {
    expect(() => currencyField.parse("IN1")).toThrow();
  });
});

describe("optionalText", () => {
  const field = optionalText("Section", 40);

  it("treats an untouched input as absent rather than an empty value", () => {
    // Forms submit "" for every untouched optional input; without this an optional field could
    // fail a minimum-length rule it was never meant to be held to.
    expect(field.parse("")).toBeUndefined();
    expect(field.parse(undefined)).toBeUndefined();
  });

  it("trims a real value", () => {
    expect(field.parse("  A  ")).toBe("A");
  });

  it("names the field in its own error message", () => {
    expect(messageFor(field, "x".repeat(41))).toBe("Section must be at most 40 characters.");
  });
});

describe("number fields", () => {
  it("coerces the strings a number input produces", () => {
    expect(positiveNumber("Width").parse("40")).toBe(40);
    expect(nonNegativeNumber("Base price").parse("0")).toBe(0);
  });

  it("names the field and the rule", () => {
    expect(messageFor(positiveNumber("Width"), "0")).toBe("Width must be greater than zero.");
    expect(messageFor(nonNegativeNumber("Base price"), "-1")).toBe("Base price can't be negative.");
    expect(messageFor(positiveNumber("Width", { max: 100 }), "101")).toContain("at most 100");
  });

  it("rejects non-numeric text", () => {
    expect(() => positiveNumber("Width").parse("wide")).toThrow();
  });
});

describe("emailField", () => {
  it("gives an example in its message", () => {
    expect(messageFor(emailField, "nope")).toContain("name@company.com");
  });

  it("accepts and trims a valid address", () => {
    expect(emailField.parse("  a@b.co  ")).toBe("a@b.co");
  });
});
