import { CopyMessageButton } from "@/components/chat/CopyMessageButton";
import { formatTime } from "@/lib/time";
import type { ChatMessage } from "@/types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const author = `${message.displayName}${isOwn ? " (you)" : ""}`;
  const time = formatTime(message.createdAt);
  return (
    <li className={`message-row ${isOwn ? "message-row-user" : ""}`}>
      <div className={`message-avatar ${isOwn ? "avatar-user" : "avatar-guide"}`} aria-hidden="true">
        {Array.from(message.displayName)[0]?.toLocaleUpperCase("en-US")}
      </div>
      <article className="message-content" aria-label={`Message from ${author}`}>
        <div className="message-meta">
          <span className="message-author">{message.displayName}</span>
          {isOwn && <span className="guide-label">YOU</span>}
          <time dateTime={message.createdAt} title="Time in UTC">{time}</time>
          <CopyMessageButton content={message.content} messageLabel={`message from ${author} at ${time}`} />
        </div>
        <p className="message-bubble">{message.content}</p>
      </article>
    </li>
  );
}
