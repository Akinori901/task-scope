import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TicketFilters from "./TicketFilters";

const searchValue = () => (screen.getByLabelText("検索") as HTMLInputElement).value;

const base = { projects: [], users: [], onChange: () => {} };

describe("TicketFilters", () => {
  it("外から検索条件が変わったら入力欄も追従する", () => {
    const { rerender } = render(<TicketFilters {...base} filters={{ search: "foo" }} />);
    expect(searchValue()).toBe("foo");

    // フィルターのリセット（親が search を消す）
    rerender(<TicketFilters {...base} filters={{}} />);
    expect(searchValue()).toBe("");

    rerender(<TicketFilters {...base} filters={{ search: "bar" }} />);
    expect(searchValue()).toBe("bar");
  });
});
