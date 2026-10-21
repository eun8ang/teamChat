import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MAX_MESSAGE_LENGTH } from "@/config/chat";

function renderComposer(isSending = false) {
  const onSend = vi.fn<(content: string) => Promise<boolean>>().mockResolvedValue(true);
  render(<MessageComposer onSend={onSend} isSending={isSending} />);
  return { onSend, input: screen.getByRole("textbox", { name: "Your message" }) as HTMLTextAreaElement };
}

function typeDraft(input: HTMLTextAreaElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function placeCaret(input: HTMLTextAreaElement, start: number, end = start) {
  input.setSelectionRange(start, end);
  fireEvent.select(input);
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Insert emoji" }));
}

function chooseEmoji(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("emoji picker", () => {
  it("inserts into an empty draft without sending and returns focus to the textarea", () => {
    const { onSend, input } = renderComposer();
    openPicker();
    chooseEmoji("Thumbs up");
    expect(input.value).toBe("👍");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Insert emoji" })).toHaveAttribute("aria-expanded", "false");
  });

  it("inserts at the last caret position and keeps the rest of the draft", () => {
    const { input } = renderComposer();
    typeDraft(input, "hello world");
    placeCaret(input, 5);
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toBe("hello🔥 world");
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(7);
  });

  it("never splits an existing emoji when the caret falls inside it", () => {
    const { input } = renderComposer();
    typeDraft(input, "hello😀 world");
    placeCaret(input, 6);
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toBe("hello🔥😀 world");
  });

  it("replaces exactly the selected range", () => {
    const { input } = renderComposer();
    typeDraft(input, "hello world");
    placeCaret(input, 0, 5);
    openPicker();
    chooseEmoji("Party popper");
    expect(input.value).toBe("🎉 world");
    expect(input.selectionStart).toBe(2);
  });

  it("appends at the end when the textarea was never focused", () => {
    const { input } = renderComposer();
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toBe("🔥");
    expect(input.selectionStart).toBe(2);
  });

  it("rejects an insertion that would exceed the limit and leaves the draft unchanged", () => {
    const { input } = renderComposer();
    typeDraft(input, "a".repeat(MAX_MESSAGE_LENGTH - 1));
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toBe("a".repeat(MAX_MESSAGE_LENGTH - 1));
    expect(screen.getByRole("status")).toHaveTextContent("Emoji not added");
  });

  it("accepts an insertion that exactly fits the limit", () => {
    const { input } = renderComposer();
    typeDraft(input, "a".repeat(MAX_MESSAGE_LENGTH - 2));
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(input.value.endsWith("🔥")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("closes on Escape and returns focus to the trigger when focus was in the picker", async () => {
    const user = userEvent.setup();
    const { input } = renderComposer();
    const trigger = screen.getByRole("button", { name: "Insert emoji" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(document.querySelector(".emoji-panel")).toHaveAttribute("hidden");
    expect(input.value).toBe("");
  });

  it("closes on Escape without moving focus away from the textarea", () => {
    const { input } = renderComposer();
    typeDraft(input, "hi");
    input.focus();
    openPicker();
    expect(screen.getByRole("button", { name: "Insert emoji" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Insert emoji" })).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveFocus();
  });

  it("supports keyboard selection with Enter and dismisses on outside pointer activation", async () => {
    const user = userEvent.setup();
    const { input } = renderComposer();
    screen.getByRole("button", { name: "Insert emoji" }).focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.getByRole("button", { name: "Grinning face" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(input.value).toBe("😀");

    openPicker();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("button", { name: "Insert emoji" })).toHaveAttribute("aria-expanded", "false");
  });

  it("uses type button so choosing an emoji never submits the form", () => {
    const { onSend, input } = renderComposer();
    typeDraft(input, "hi");
    openPicker();
    const options = screen.getAllByRole("button").filter((button) => button.classList.contains("emoji-option"));
    expect(options).toHaveLength(16);
    for (const option of options) expect(option).toHaveAttribute("type", "button");
    chooseEmoji("Smiling face");
    expect(input.value).toBe("hi😊");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the trigger while sending", () => {
    renderComposer(true);
    expect(screen.getByRole("button", { name: "Insert emoji" })).toBeDisabled();
  });

  it("does not edit the draft while IME composition is active", () => {
    const { input } = renderComposer();
    typeDraft(input, "안녕");
    fireEvent.compositionStart(input);
    openPicker();
    chooseEmoji("Fire");
    expect(input.value).toBe("안녕");
    expect(screen.getByRole("status")).toHaveTextContent("Finish composing");
    fireEvent.compositionEnd(input);
  });
});
