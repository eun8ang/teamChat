import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { CHAT_TITLE, IDENTITY_STORAGE_KEY, MAX_MESSAGE_LENGTH, MESSAGE_POLL_INTERVAL_MS, MESSAGE_REQUEST_TIMEOUT_MS } from "@/config/chat";
import { useChat } from "@/hooks/useChat";
import { useIdentity } from "@/hooks/useIdentity";
import type { ChatIdentity, ChatMessage } from "@/types/chat";

const alex: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000001", displayName: "Alex" };
const sam: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000002", displayName: "Sam" };
const message = (id: string, identity = sam, content = `Message ${id}`): ChatMessage => ({ id, ...identity, content, createdAt: "2026-10-20T09:05:00.000Z" });
const initialMessages = [message("100-0", sam, "Hello from Sam"), message("101-0", alex, "Hello from Alex")];
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let visibility: DocumentVisibilityState;

async function renderHome(joined = true) {
  if (joined) sessionStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(alex));
  render(<Home />);
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json({ messages: initialMessages, cursor: "101-0" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shared workshop chat", () => {
  it("renders configured title, real authors, and the shared-room explanation", async () => {
    await renderHome();
    expect(screen.getByRole("heading", { level: 1, name: CHAT_TITLE })).toBeInTheDocument();
    expect(screen.getByText("Shared room")).toBeInTheDocument();
    expect(screen.getByText(/Messages remain after refresh/)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    const log = screen.getByRole("log", { name: "Messages" });
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    expect(within(log).getByRole("article", { name: "Message from Alex (you)" }).closest("li")).toHaveClass("message-row-user");
    expect(within(log).getByRole("article", { name: "Message from Sam" }).closest("li")).not.toHaveClass("message-row-user");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("asks for a display name and stores a tab identity before allowing sending", async () => {
    await renderHome(false);
    expect(screen.queryByRole("textbox", { name: "Your message" })).not.toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: "Your display name" });
    const join = screen.getByRole("button", { name: "Join conversation" });
    fireEvent.change(name, { target: { value: "   " } });
    expect(join).toBeDisabled();
    fireEvent.change(name, { target: { value: "  Jamie  " } });
    fireEvent.click(join);
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem(IDENTITY_STORAGE_KEY)!);
    expect(stored.displayName).toBe("Jamie");
    expect(stored.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("blocks whitespace through both Enter and form submission", async () => {
    await renderHome();
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: " \n\t " } });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(screen.getByRole("form", { name: "Send a message" }));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it("shows sending state and clears the draft only when the server accepts it", async () => {
    let finishPost!: (response: Response) => void;
    fetchMock.mockImplementation(async (_url, options) => options?.method === "POST" ? new Promise<Response>((resolve) => { finishPost = resolve; }) : json({ messages: initialMessages, cursor: "101-0" }));
    await renderHome();
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: "  Hello, everyone!  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(input).toHaveValue("  Hello, everyone!  ");
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    await act(async () => { finishPost(json({ message: message("105-0", alex, "Hello, everyone!"), cursor: "105-0" }, 201)); });
    expect(within(screen.getByRole("log")).getByText("Hello, everyone!")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ ...alex, content: "Hello, everyone!" });
  });

  it("keeps a failed draft and reuses its message ID on network retry", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: initialMessages, cursor: "101-0" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ message: message("105-0", alex, "Keep my draft"), cursor: "105-0" }, 200));
    await renderHome();
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: "Keep my draft" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send message" })); });
    expect(input).toHaveValue("Keep my draft");
    expect(screen.getByRole("alert")).toHaveTextContent("Your draft is safe");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send message" })); });
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[0][1]!.body as string).clientMessageId).toBe(JSON.parse(posts[1][1]!.body as string).clientMessageId);
    expect(input).toHaveValue("");
    expect(within(screen.getByRole("log")).getAllByText("Keep my draft")).toHaveLength(1);
  });

  it("keeps the welcome visible initially and scrolls on a new message", () => {
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(480);
    const { rerender } = render(<MessageList messages={initialMessages} currentClientId={alex.clientId} isLoading={false} />);
    const history = screen.getByRole("region", { name: "Conversation history" });
    expect(history.scrollTop).toBe(0);
    rerender(<MessageList messages={[...initialMessages, message("102-0")]} currentClientId={alex.clientId} isLoading={false} />);
    expect(history.scrollTop).toBe(480);
    history.scrollTop = 0;
    // A capped list can receive another message without changing its length.
    rerender(<MessageList messages={[initialMessages[1], message("102-0"), message("103-0")]} currentClientId={alex.clientId} isLoading={false} />);
    expect(history.scrollTop).toBe(480);
  });
});

describe("composer keyboard behavior", () => {
  it("allows Shift+Enter and sends a multiline draft with Enter", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} isSending={false} />);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: "First line" } });
    expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "First line\nSecond line" } });
    await act(async () => { expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false); });
    expect(onSend).toHaveBeenCalledWith("First line\nSecond line");
    expect(input).toHaveValue("");
  });

  it("keeps Korean composition Enter from sending until composition ends", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} isSending={false} />);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "안녕하세요" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("안녕하세요");
    fireEvent.compositionEnd(input);
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(onSend).toHaveBeenCalledWith("안녕하세요");
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])("respects browser composition flags %j", (flags) => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<MessageComposer onSend={onSend} isSending={false} />);
    const input = screen.getByRole("textbox", { name: "Your message" });
    fireEvent.change(input, { target: { value: "한글" } });
    fireEvent.keyDown(input, { key: "Enter", ...flags });
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("한글");
  });
});

describe("emoji picker", () => {
  function renderComposer(isSending = false) {
    const onSend = vi.fn().mockResolvedValue(true);
    const view = render(<MessageComposer onSend={onSend} isSending={isSending} />);
    const input = screen.getByRole("textbox", { name: "Your message" }) as HTMLTextAreaElement;
    const trigger = screen.getByRole("button", { name: "Insert emoji" });
    return { ...view, onSend, input, trigger };
  }

  function select(input: HTMLTextAreaElement, start: number, end = start) {
    input.setSelectionRange(start, end);
    fireEvent.select(input);
  }

  it("inserts into an empty draft without sending and restores the caret", () => {
    const { onSend, input, trigger } = renderComposer();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(within(panel).getAllByRole("button").length).toBeGreaterThanOrEqual(12);
    fireEvent.click(within(panel).getByRole("button", { name: "Thumbs up" }));
    expect(input).toHaveValue("👍");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(2);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("inserts at the previous caret and replaces exactly the selected text", () => {
    const { input, trigger } = renderComposer();
    fireEvent.change(input, { target: { value: "Hello world" } });
    select(input, 5);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Waving hand" }));
    expect(input).toHaveValue("Hello👋 world");
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(7);
    select(input, 8, 13);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Red heart" }));
    expect(input).toHaveValue("Hello👋 ❤️");
    expect(input.selectionStart).toBe(10);
  });

  it("rejects an emoji that would exceed the limit and accepts one that exactly fits", () => {
    const { input, trigger } = renderComposer();
    const nearlyFull = "a".repeat(MAX_MESSAGE_LENGTH - 1);
    fireEvent.change(input, { target: { value: nearlyFull } });
    select(input, 3);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Rocket" }));
    expect(input).toHaveValue(nearlyFull);
    expect(screen.getByRole("status")).toHaveTextContent(/would exceed 1,000 characters/);
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "a".repeat(MAX_MESSAGE_LENGTH - 2) } });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Rocket" }));
    expect(input).toHaveValue(`${"a".repeat(MAX_MESSAGE_LENGTH - 2)}🚀`);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("supports keyboard access, Escape dismissal, and leaving with Tab", () => {
    const { input, trigger } = renderComposer();
    fireEvent.click(trigger);
    const first = screen.getByRole("button", { name: "Grinning face" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("type", "button");
    fireEvent.keyDown(first, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(input).toHaveValue("");
    fireEvent.click(trigger);
    const send = screen.getByRole("button", { name: "Send message" });
    fireEvent.blur(screen.getByRole("button", { name: "Hundred points" }), { relatedTarget: send });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.pointerDown(input);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cannot edit the draft while sending or during IME composition", () => {
    const { input, trigger, rerender, onSend } = renderComposer();
    fireEvent.compositionStart(input);
    expect(trigger).toBeDisabled();
    fireEvent.compositionEnd(input);
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    rerender(<MessageComposer onSend={onSend} isSending />);
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("");
  });
});

describe("server synchronization", () => {
  it("times out a stalled read and resumes polling", async () => {
    fetchMock.mockImplementationOnce((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const { result } = renderHook(() => useChat(alex));
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_REQUEST_TIMEOUT_MS); });
    expect(result.current.connectionStatus).toBe("reconnecting");
    expect(result.current.error).toMatch(/too long/);
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS); });
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.error).toBeNull();
  });

  it("times out a stalled send and reuses the retry ID", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method !== "POST") return json({ messages: [], cursor: "0-0" });
      postCount += 1;
      if (postCount === 1) return new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
      return json({ message: message("105-0", alex, "Retry me"), cursor: "105-0" }, 200);
    });
    const { result } = renderHook(() => useChat(alex));
    await act(async () => {});
    let firstSend!: Promise<boolean>;
    act(() => { firstSend = result.current.sendMessage("Retry me"); });
    expect(result.current.isSending).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_REQUEST_TIMEOUT_MS); });
    expect(await firstSend).toBe(false);
    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toMatch(/Sending took too long/);
    await act(async () => { expect(await result.current.sendMessage("Retry me")).toBe(true); });
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(JSON.parse(posts[0][1]!.body as string).clientMessageId).toBe(JSON.parse(posts[1][1]!.body as string).clientMessageId);
  });

  it("keeps the latest 300 messages while consuming ordered batches", async () => {
    let batch = 0;
    fetchMock.mockImplementation(async () => {
      const start = batch++ * 100 + 1;
      return json({ messages: Array.from({ length: 100 }, (_, index) => message(`${start + index}-0`)), cursor: `${start + 99}-0` });
    });
    const { result } = renderHook(() => useChat(alex));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS * 3); });
    expect(result.current.messages).toHaveLength(300);
    expect(result.current.messages[0].id).toBe("101-0");
    expect(result.current.messages.at(-1)!.id).toBe("400-0");
  });

  it("does not skip intervening participants or lose a sent message to a stale GET", async () => {
    let finishGet!: (response: Response) => void;
    let getCount = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") return json({ message: message("105-0", alex, "My new message"), cursor: "105-0" }, 201);
      getCount += 1;
      if (getCount === 1) return json({ messages: [message("100-0")], cursor: "100-0" });
      if (getCount === 2) return new Promise<Response>((resolve) => { finishGet = resolve; });
      return json({ messages: [message("105-0", alex, "My new message")], cursor: "105-0" });
    });
    const { result } = renderHook(() => useChat(alex));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS); });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/messages?after=100-0");
    await act(async () => { expect(await result.current.sendMessage("My new message")).toBe(true); });
    expect(result.current.messages.map((item) => item.id)).toEqual(["100-0", "105-0"]);
    await act(async () => { finishGet(json({ messages: [101, 102, 103, 104].map((id) => message(`${id}-0`)), cursor: "104-0" })); });
    expect(result.current.messages.map((item) => item.id)).toEqual(["100-0", "101-0", "102-0", "103-0", "104-0", "105-0"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS); });
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/messages?after=104-0");
    expect(result.current.messages.filter((item) => item.id === "105-0")).toHaveLength(1);
  });

  it("pauses polling in a hidden tab, refreshes on return, and cleans up", async () => {
    const { unmount } = renderHook(() => useChat(null));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS * 3); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports storage failure and recovers on the next successful poll", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "The shared room is temporarily unavailable." }, 503))
      .mockResolvedValueOnce(json({ messages: initialMessages, cursor: "101-0" }));
    const { result } = renderHook(() => useChat(alex));
    await act(async () => {});
    expect(result.current.connectionStatus).toBe("reconnecting");
    expect(result.current.error).toMatch(/temporarily unavailable/);
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_POLL_INTERVAL_MS); });
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual(initialMessages);
  });

  it("shows rate-limit retry timing without adding a rejected message", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], cursor: "0-0" }))
      .mockResolvedValueOnce(json({ error: "Too many messages." }, 429, { "Retry-After": "8" }));
    const { result } = renderHook(() => useChat(alex));
    await act(async () => {});
    await act(async () => { expect(await result.current.sendMessage("Wait for me")).toBe(false); });
    expect(result.current.error).toContain("Try again in 8 seconds.");
    expect(result.current.messages).toEqual([]);
  });
});

describe("tab identity", () => {
  it("restores the same identity after remounting", async () => {
    const first = renderHook(() => useIdentity());
    await act(async () => {});
    act(() => { expect(first.result.current.join("  Alex  ")).toBe(true); });
    const identity = first.result.current.identity;
    first.unmount();
    const restored = renderHook(() => useIdentity());
    await act(async () => {});
    expect(restored.result.current.identity).toEqual(identity);
    expect(restored.result.current.isReady).toBe(true);
  });

  it.each(["{broken", JSON.stringify({ clientId: "bad", displayName: "Alex" })])("ignores malformed stored identity %s", async (stored) => {
    sessionStorage.setItem(IDENTITY_STORAGE_KEY, stored);
    const { result } = renderHook(() => useIdentity());
    await act(async () => {});
    expect(result.current.identity).toBeNull();
    expect(result.current.isReady).toBe(true);
  });
});
