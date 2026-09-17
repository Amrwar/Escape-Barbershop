import { describe, expect, it } from "vitest";
import { isSellable, lineTotal, marginOf, priceLines, problemsWith, productsTotal } from "./retail";

const oil = { id: "oil", name: "Beard oil", isActive: true, salePrice: 180, costPrice: 60 };
const wax = { id: "wax", name: "Hair wax", isActive: true, salePrice: 250, costPrice: 90 };
/** Bought for the floor, never sold: no price on it. */
const bleach = { id: "bleach", name: "Bleach powder", isActive: true, salePrice: 0, costPrice: 400 };
const discontinued = { id: "old", name: "Old pomade", isActive: false, salePrice: 100, costPrice: 40 };

const stock = { oil: 10, wax: 4, bleach: 20, old: 5 };

describe("what is for sale", () => {
  it("is anything active with a price on it", () => {
    expect(isSellable(oil)).toBe(true);
  });

  it("is not stock the shop only uses on the floor", () => {
    expect(isSellable(bleach)).toBe(false);
  });

  it("is not something discontinued, whatever its price says", () => {
    expect(isSellable(discontinued)).toBe(false);
  });
});

describe("what a sale comes to", () => {
  it("multiplies out a line", () => {
    expect(lineTotal({ productId: "oil", quantity: 2, unitPrice: 180 })).toBe(360);
  });

  it("adds the lines up", () => {
    expect(
      productsTotal([
        { productId: "oil", quantity: 2, unitPrice: 180 },
        { productId: "wax", quantity: 1, unitPrice: 250 },
      ])
    ).toBe(610);
  });

  it("takes the price the cashier actually charged", () => {
    // Sold at 150 rather than the 180 on the shelf: the receipt is what happened.
    expect(productsTotal([{ productId: "oil", quantity: 1, unitPrice: 150 }])).toBe(150);
  });

  it("comes to nothing when nothing was sold", () => {
    expect(productsTotal([])).toBe(0);
  });
});

describe("writing the sale down", () => {
  it("copies in the name and what it cost the shop", () => {
    const [line] = priceLines([{ productId: "oil", quantity: 2, unitPrice: 180 }], [oil, wax]);
    expect(line).toMatchObject({ name: "Beard oil", unitCost: 60, total: 360 });
  });

  it("works out the margin over what the stock cost", () => {
    const lines = priceLines(
      [
        { productId: "oil", quantity: 2, unitPrice: 180 },
        { productId: "wax", quantity: 1, unitPrice: 250 },
      ],
      [oil, wax]
    );
    // Took 610, the stock cost 210.
    expect(marginOf(lines)).toBe(400);
  });
});

describe("what the till must refuse", () => {
  it("passes a sale the shop can actually make", () => {
    expect(problemsWith([{ productId: "oil", quantity: 2, unitPrice: 180 }], [oil], stock)).toHaveLength(0);
  });

  it("refuses something it does not stock", () => {
    const [problem] = problemsWith([{ productId: "ghost", quantity: 1, unitPrice: 10 }], [oil], stock);
    expect(problem.problem).toBe("unknown");
  });

  it("refuses to sell what is only used on the floor", () => {
    const [problem] = problemsWith([{ productId: "bleach", quantity: 1, unitPrice: 50 }], [bleach], stock);
    expect(problem).toMatchObject({ problem: "not-for-sale", name: "Bleach powder" });
  });

  it("refuses a quantity that is not one", () => {
    expect(problemsWith([{ productId: "oil", quantity: 0, unitPrice: 180 }], [oil], stock)[0].problem).toBe("quantity");
    expect(problemsWith([{ productId: "oil", quantity: -2, unitPrice: 180 }], [oil], stock)[0].problem).toBe("quantity");
  });

  it("refuses to sell more than the shelf holds", () => {
    const [problem] = problemsWith([{ productId: "wax", quantity: 6, unitPrice: 250 }], [wax], stock);
    expect(problem).toMatchObject({ problem: "short", name: "Hair wax", available: 4 });
  });

  it("adds two lines of the same thing together before looking at the shelf", () => {
    // Three and three is six, and there are only four.
    const problems = problemsWith(
      [
        { productId: "wax", quantity: 3, unitPrice: 250 },
        { productId: "wax", quantity: 3, unitPrice: 250 },
      ],
      [wax],
      stock
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toBe("short");
  });

  it("allows two lines that fit between them", () => {
    expect(
      problemsWith(
        [
          { productId: "wax", quantity: 2, unitPrice: 250 },
          { productId: "wax", quantity: 2, unitPrice: 250 },
        ],
        [wax],
        stock
      )
    ).toHaveLength(0);
  });

  it("treats a product nobody has stocked as empty rather than infinite", () => {
    const [problem] = problemsWith([{ productId: "oil", quantity: 1, unitPrice: 180 }], [oil], {});
    expect(problem).toMatchObject({ problem: "short", available: 0 });
  });
});
