import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useChat } from "@/hooks/useChat";
import { MESSAGE_REQUEST_TIMEOUT_MS } from "@/config/chat";

const identity = { clientId: "00000000-0000-4000-8000-000000000001", displayName: "Alex" };
const file = () => new File(["image bytes"], "workshop.png", { type: "image/png" });
const upload = { id: "a".repeat(32), expiresAt: 1800000000000 };
const message = { ...identity, id: "100-0", content: "Caption", createdAt: "2026-11-05T00:00:00.000Z", attachment: { ...upload, alt: "A drawing" } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("image picker and rendering", () => {
  it("requires a description, preserves failed drafts and revokes preview URLs on removal", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const { unmount } = render(<MessageComposer onSend={onSend} isSending={false} />);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Caption" } });
    const selected = file();
    fireEvent.change(screen.getByLabelText("Choose image"), { target: { files: [selected] } });
    expect(screen.getByAltText("Selected image preview")).toHaveAttribute("src", "blob:preview");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Image description"), { target: { value: "A drawing" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send message" })); });
    expect(onSend).toHaveBeenCalledWith("Caption", { file: selected, alt: "A drawing" });
    expect(screen.getByLabelText("Your message")).toHaveValue("Caption");
    expect(screen.getByLabelText("Image description")).toHaveValue("A drawing");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    fireEvent.change(screen.getByLabelText("Choose image"), { target: { files: [file()] } });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it("rejects multiple, unsupported and oversized files and releases replaced previews", () => {
    render(<MessageComposer onSend={vi.fn()} isSending={false} />);
    const input = screen.getByLabelText("Choose image");
    for (const files of [[file(), file()], [new File(["svg"], "a.svg", { type: "image/svg+xml" })], [new File([new Uint8Array(102401)], "a.png", { type: "image/png" })]]) {
      fireEvent.change(input, { target: { files } });
      expect(screen.getByRole("alert")).toHaveTextContent("100 KiB");
      expect(screen.queryByLabelText("Image description")).not.toBeInTheDocument();
    }
    fireEvent.change(input, { target: { files: [file()] } });
    fireEvent.change(input, { target: { files: [file()] } });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("renders same-origin lazy media with alt and retains caption on error", () => {
    render(<MessageBubble message={message} isOwn={false} />);
    const image = screen.getByRole("img", { name: "A drawing" });
    expect(image).toHaveAttribute("src", `/api/media/${upload.id}`);
    expect(image).toHaveAttribute("loading", "lazy");
    fireEvent.error(image);
    expect(screen.getByText("Image expired or unavailable")).toBeInTheDocument();
    expect(screen.getByText("Caption")).toBeInTheDocument();
  });
});
describe("image send retries", () => {
  it("keeps a successful upload and message ID after a message timeout, then clears on success", async () => {
    vi.useFakeTimers();
    let posts = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (url === "/api/media") return json(upload, 201);
      if (options?.method !== "POST") return json({ messages: [], cursor: "0-0" });
      if (++posts === 1) return new Promise((_resolve, reject) => { options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); });
      return json({ message, cursor: message.id });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat(identity));
    await act(async () => {});
    const image = { file: file(), alt: "A drawing" };
    let first!: Promise<boolean>;
    await act(async () => { first = result.current.sendMessage("Caption", image); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MESSAGE_REQUEST_TIMEOUT_MS); });
    expect(await first).toBe(false);
    await act(async () => { expect(await result.current.sendMessage("Caption", image)).toBe(true); });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/media")).toHaveLength(1);
    const bodies = fetchMock.mock.calls.filter(([url, options]) => url === "/api/messages" && options?.method === "POST").map(([, options]) => JSON.parse(options!.body as string));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].attachment).toEqual({ id: upload.id, alt: "A drawing" });
    expect(JSON.stringify(bodies)).not.toContain("image bytes");
    expect(result.current.messages).toEqual([message]);
  });
  it("retries upload failures and assigns new IDs to changed captions, descriptions or files", async () => {
    let uploads = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (url === "/api/media") return ++uploads === 1 ? json({ error: "Upload failed" }, 503) : json(upload);
      return options?.method === "POST" ? json({ error: "Send failed" }, 503) : json({ messages: [], cursor: "0-0" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat(identity));
    await act(async () => {});
    const image = { file: file(), alt: "A drawing" };
    await act(async () => { expect(await result.current.sendMessage("Caption", image)).toBe(false); });
    expect(result.current.error).toBe("Upload failed");
    for (const [caption, next] of [["Caption", image], ["Changed caption", image], ["Changed caption", { ...image, alt: "New description" }], ["Changed caption", { ...image, file: file() }]] as const) {
      await act(async () => { expect(await result.current.sendMessage(caption, next)).toBe(false); });
    }
    const bodies = fetchMock.mock.calls.filter(([url, options]) => url === "/api/messages" && options?.method === "POST").map(([, options]) => JSON.parse(options!.body as string));
    expect(new Set(bodies.map((body) => body.clientMessageId)).size).toBe(4);
  });
});
