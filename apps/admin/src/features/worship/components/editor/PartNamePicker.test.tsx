import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartNamePicker } from "./PartNamePicker";

describe("PartNamePicker", () => {
  it("confirma a escolha mesmo quando ela tem o mesmo nome da parte de origem", () => {
    const onPick = vi.fn();
    render(
      <PartNamePicker
        open
        onOpenChange={vi.fn()}
        name="Verso 1"
        kind="VERSE"
        parts={[{ rowId: "verse", index: 0, name: "Verso 1", kind: "VERSE", mood: "WORSHIP", time: null, firstSlide: 0, slideCount: 1 }]}
        forcePick
        onPick={onPick}
      >
        <button>Dividir parte</button>
      </PartNamePicker>,
    );

    fireEvent.click(screen.getByRole("option", { name: "Verso 1" }));

    expect(onPick).toHaveBeenCalledWith({ kind: "VERSE", name: "Verso 1" });
  });
});
