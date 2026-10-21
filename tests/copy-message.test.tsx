import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatIdentity, ChatMessage } from "@/types/chat";

const alex: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000001", displayName: "Alex" };
const sam: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000002", displayName: "Sam" };
// Newlines, padding, an emoji, and a URL must survive the copy untouched.
const shared = "Line one\n\n  Line two 🎉\nhttps://example.com/path?a=1&b=2  ";
const messages: ChatMessage[] = [
  { id: "100-0", ...sam, content: shared, createdAt: "2026-10-20T09:05:00.000Z" },
  { id: "101-0", ...alex, content: "Hello from Alex", createdAt: "2026-10-20T09:06:00.000Z" },
];
const SAM_ACTION = "Copy message from Sam at 09:05";
const ALEX_ACTION = "Copy message from Alex (you) at 09:06";
const FAILURE_TEXT = "Could not copy. Select the message text and copy it manually.";

let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

const setClipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
const action = (name: string) => screen.getByRole("button", { name });
const feedback = (author: string) => within(screen.getByRole("article", { name: author })).getByRole("status");
const renderMessages = () => render(<MessageList messages={messages} currentClientId={alex.clientId} isLoading={false} />);

beforeEach(() => {
  writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  setClipboard({ writeText });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});

describe("copying a message", () => {
  it("writes the exact stored content and announces success only after the write resolves", async () => {
    let finishWrite!: () => void;
    writeText.mockImplementation(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    renderMessages();
    const status = feedback("Message from Sam");

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(shared);
    expect(status.textContent).toBe("");

    await act(async () => { finishWrite(); });
    expect(status).toHaveTextContent("Copied");
    // The message itself is untouched by the action.
    expect(screen.getByRole("article", { name: "Message from Sam" }).querySelector("p")?.textContent).toBe(shared);
  });

  it("copies from the keyboard without leaving the conversation", async () => {
    const user = userEvent.setup();
    setClipboard({ writeText }); // setup() installs its own clipboard stub over the mock.
    renderMessages();

    await user.tab();
    expect(screen.getByRole("region", { name: "Conversation history" })).toHaveFocus();
    await user.tab();
    expect(action(SAM_ACTION)).toHaveFocus();
    await user.keyboard("{Enter}");
    await act(async () => {});

    expect(writeText).toHaveBeenCalledExactlyOnceWith(shared);
    expect(feedback("Message from Sam")).toHaveTextContent("Copied");
  });

  it("keeps feedback on the activated message only", async () => {
    renderMessages();
    await act(async () => { fireEvent.click(action(ALEX_ACTION)); });

    expect(writeText).toHaveBeenCalledExactlyOnceWith("Hello from Alex");
    expect(feedback("Message from Alex (you)")).toHaveTextContent("Copied");
    expect(feedback("Message from Sam").textContent).toBe("");
  });

  it.each([
    { cause: "a rejected write", breakClipboard: () => { writeText.mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError")); } },
    { cause: "a missing Clipboard API", breakClipboard: () => { setClipboard(undefined); } },
  ])("explains how to copy manually after $cause", async ({ breakClipboard }) => {
    breakClipboard();
    renderMessages();

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    expect(feedback("Message from Sam")).toHaveTextContent(FAILURE_TEXT);
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("ignores a slow earlier write once a newer attempt has reported", async () => {
    let finishFirst!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockRejectedValueOnce(new Error("Clipboard unavailable"));
    renderMessages();
    const status = feedback("Message from Sam");

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    expect(status).toHaveTextContent(FAILURE_TEXT);

    await act(async () => { finishFirst(); });
    expect(status).toHaveTextContent(FAILURE_TEXT);
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("clears stale feedback on a new attempt and drops its reset timer on unmount", async () => {
    vi.useFakeTimers();
    let finishSecond!: () => void;
    writeText.mockRejectedValueOnce(new Error("Clipboard unavailable"))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishSecond = resolve; }));
    const { unmount } = renderMessages();
    const status = feedback("Message from Sam");

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    expect(status).toHaveTextContent(FAILURE_TEXT);

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    expect(status.textContent).toBe("");
    await act(async () => { finishSecond(); });
    expect(status).toHaveTextContent("Copied");

    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(status.textContent).toBe("");

    await act(async () => { fireEvent.click(action(SAM_ACTION)); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
