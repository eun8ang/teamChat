import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_RESET_MS, CopyMessageButton } from "@/components/chat/CopyMessageButton";

const FAILURE = "Could not copy. Select the message text and copy it manually.";

function setClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true, writable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

describe("CopyMessageButton", () => {
  it("writes the exact message content, including newlines and emoji, and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const content = "Line one\nLine two 😀\thttps://example.com/path?q=1";
    render(<CopyMessageButton content={content} authorName="Sam" />);

    const button = screen.getByRole("button", { name: "Copy message from Sam" });
    expect(button).toHaveAttribute("type", "button");

    await act(async () => { fireEvent.click(button); });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(content);
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("announces success only after the clipboard write resolves", async () => {
    let resolveWrite!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    setClipboard({ writeText });
    render(<CopyMessageButton content="Hi" authorName="Sam" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" }));
    expect(writeText).toHaveBeenCalled();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();

    await act(async () => { resolveWrite(); });
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("shows a manual-copy message and never says Copied when the write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    setClipboard({ writeText });
    render(<CopyMessageButton content="Hi" authorName="Sam" />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" })); });

    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("shows a manual-copy message when the Clipboard API is unavailable", async () => {
    setClipboard(undefined);
    render(<CopyMessageButton content="Hi" authorName="Sam" />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" })); });

    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("keeps feedback scoped to the activated message", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(
      <div>
        <CopyMessageButton content="A" authorName="Sam" />
        <CopyMessageButton content="B" authorName="Alex" />
      </div>,
    );

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" })); });

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveTextContent("Copied");
    expect(statuses[1]).toBeEmptyDOMElement();
  });

  it("clears stale feedback when a new copy attempt begins", async () => {
    let resolveSecond!: () => void;
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSecond = resolve; }));
    setClipboard({ writeText });
    render(<CopyMessageButton content="Hi" authorName="Sam" />);
    const button = screen.getByRole("button", { name: "Copy message from Sam" });

    await act(async () => { fireEvent.click(button); });
    expect(screen.getByText("Copied")).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();

    await act(async () => { resolveSecond(); });
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("clears feedback after a delay and removes its timer on unmount", async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      const { unmount } = render(<CopyMessageButton content="Hi" authorName="Sam" />);

      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" })); });
      expect(screen.getByText("Copied")).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS); });
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();

      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy message from Sam" })); });
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
