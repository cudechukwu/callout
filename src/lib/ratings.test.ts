import { describe, expect, it } from "vitest";
import { ratingToDisplay } from "./ratings";

describe("ratingToDisplay", () => {
  it("puts the average pool rating at 70, the same anchor as OVR", () => {
    expect(ratingToDisplay(4.46)).toBe(70);
  });

  it("maps a perfect 5.0 to 99 and never exceeds it", () => {
    expect(ratingToDisplay(5)).toBe(99);
    expect(ratingToDisplay(6)).toBe(99);
  });

  it("has a floor so weak picks still show a visible bar", () => {
    expect(ratingToDisplay(1)).toBe(20);
  });

  it("rises with the rating", () => {
    let previous = -1;
    for (let r = 3; r <= 5; r += 0.1) {
      const value = ratingToDisplay(r);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
