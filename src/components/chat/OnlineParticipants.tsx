import { OnlineCount } from "@/components/chat/OnlineCount";
import { displayInitial } from "@/lib/presence";
import type { PresenceState } from "@/types/chat";

interface OnlineParticipantsProps {
  presence: PresenceState;
  currentClientId: string | null;
}

// Lists active sessions from presence data only, newest arrival first (server order).
export function OnlineParticipants({ presence, currentClientId }: OnlineParticipantsProps) {
  const { status, snapshot } = presence;
  return (
    <details className="online-participants">
      <summary>
        <span className="online-participants-title">Online participants</span>
        <OnlineCount presence={presence} />
      </summary>
      <div className="online-participants-body">
        {status === "loading" ? (
          <p className="presence-note">Checking active sessions…</p>
        ) : !snapshot ? (
          <p className="presence-note">Active sessions can’t be loaded right now. We’ll keep trying.</p>
        ) : (
          <>
            <p className="presence-note">
              {status === "stale"
                ? "Couldn’t refresh. This is the last list received and may be outdated."
                : "Active browser sessions in this room, newest first. Names are not verified."}
            </p>
            {snapshot.participants.length === 0 ? (
              <p className="presence-note">No active sessions right now.</p>
            ) : (
              <div className="participant-scroll" role="region" aria-label="Active sessions" tabIndex={0}>
                <ul className="participant-roster">
                  {snapshot.participants.map((participant) => (
                    <li className="participant-row" key={participant.clientId}>
                      <span className="participant-avatar" aria-hidden="true">{displayInitial(participant.displayName)}</span>
                      <span className="participant-name">{participant.displayName}</span>
                      {participant.clientId === currentClientId && (
                        <span className="participant-you"><span className="sr-only">, </span>You</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
