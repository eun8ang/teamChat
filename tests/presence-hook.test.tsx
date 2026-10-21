import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineParticipants } from "@/components/chat/OnlineParticipants";
import { PRESENCE_REFRESH_INTERVAL_MS, PRESENCE_STALE_LIMIT_MS } from "@/config/chat";
import { usePresence } from "@/hooks/usePresence";
import type { ChatIdentity, PresenceSnapshot, PresenceState } from "@/types/chat";

const alex: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000001", displayName: "Alex" };
const twin: ChatIdentity = { clientId: "00000000-0000-4000-8000-000000000002", displayName: "Alex" };
const snapshot: PresenceSnapshot = {
  onlineCount: 2,
  observedAt: 1700000020000,
  participants: [
    { ...twin, connectedAt: 1700000010000, lastSeenAt: 1700000015000 },
    { ...alex, connectedAt: 1700000000000, lastSeenAt: 1700000020000 },
  ],
};
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let visibility: DocumentVisibilityState;
const methods = () => fetchMock.mock.calls.map(([, options]) => options?.method ?? "GET");

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json(snapshot));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("presence schedule", () => {
  it("only reads before joining, so visitors are not counted", async () => {
    const { result } = renderHook(() => usePresence(null));
    await advance(0);
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 3);
    expect(methods()).toEqual(["GET", "GET", "GET", "GET"]);
    expect(result.current).toEqual({ status: "current", snapshot });
  });

  it("sends a heartbeat on join and every 20 seconds, refreshing every 10 seconds in between", async () => {
    renderHook(() => usePresence(alex));
    await advance(0);
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 4);
    expect(methods()).toEqual(["PUT", "GET", "PUT", "GET", "PUT"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(alex);
  });

  it("sends nothing while hidden, heartbeats immediately on resume, and cleans up on unmount", async () => {
    const { unmount } = renderHook(() => usePresence(alex));
    await advance(0);
    visibility = "hidden";
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 5);
    expect(methods()).toEqual(["PUT"]);
    visibility = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await advance(0);
    expect(methods()).toEqual(["PUT", "PUT"]);
    unmount();
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces ticks that arrive while a request is in flight", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    renderHook(() => usePresence(null));
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish(json(snapshot)); });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks a recent snapshot stale on failure, drops it after the activity window, and recovers", async () => {
    const { result } = renderHook(() => usePresence(null));
    await advance(0);
    fetchMock.mockImplementation(async () => json({ error: "unavailable" }, 503));
    await advance(PRESENCE_REFRESH_INTERVAL_MS);
    expect(result.current).toEqual({ status: "stale", snapshot });
    await advance(PRESENCE_STALE_LIMIT_MS);
    expect(result.current).toEqual({ status: "unavailable", snapshot: null });
    fetchMock.mockImplementation(async () => json(snapshot));
    await advance(PRESENCE_REFRESH_INTERVAL_MS);
    expect(result.current.status).toBe("current");
  });

  it("rejects an invalid response instead of replacing the snapshot", async () => {
    fetchMock.mockImplementation(async () => json({ ...snapshot, onlineCount: 3 }));
    const { result } = renderHook(() => usePresence(null));
    await advance(0);
    expect(result.current).toEqual({ status: "unavailable", snapshot: null });
  });

  it("keeps reading as a visitor while the room is full", async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: "full" }, 429, { "Retry-After": "30" }));
    const { result } = renderHook(() => usePresence(alex));
    await advance(0);
    expect(methods()).toEqual(["PUT", "GET"]);
    expect(result.current.status).toBe("current");
    await advance(PRESENCE_REFRESH_INTERVAL_MS * 3);
    expect(methods()).toEqual(["PUT", "GET", "GET", "GET", "PUT"]);
  });
});

describe("online participants", () => {
  const renderRoster = (presence: PresenceState) => render(<OnlineParticipants presence={presence} currentClientId={alex.clientId} />);

  it("lists duplicate names as separate sessions in server order with only the local one marked You", () => {
    renderRoster({ status: "current", snapshot });
    expect(screen.getByRole("status")).toHaveTextContent("2 sessions online");
    // The roster sits inside a collapsed <details>; include it regardless of open state.
    const region = screen.getByRole("region", { name: "Active sessions", hidden: true });
    const rows = within(region).getAllByRole("listitem", { hidden: true });
    expect(rows.map((row) => row.textContent)).toEqual(["AAlex", "AAlex, You"]);
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it.each<[PresenceState, string, RegExp]>([
    [{ status: "loading", snapshot: null }, "Checking who’s online…", /Checking active sessions/],
    [{ status: "current", snapshot: { onlineCount: 0, observedAt: 1, participants: [] } }, "0 sessions online", /No active sessions right now/],
    [{ status: "unavailable", snapshot: null }, "Online count unavailable", /can’t be loaded/],
    [{ status: "stale", snapshot }, "2 sessions online (may be outdated)", /Couldn’t refresh/],
  ])("distinguishes presence states %#", (presence, count, note) => {
    renderRoster(presence);
    expect(screen.getByRole("status")).toHaveTextContent(count);
    expect(screen.getByText(note)).toBeInTheDocument();
  });
});
