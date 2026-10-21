"use client";

import { BuildInfo } from "@/components/chat/BuildInfo";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatStats } from "@/components/chat/ChatStats";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { MessageSearch } from "@/components/chat/MessageSearch";
import { OnlineParticipants } from "@/components/chat/OnlineParticipants";
import { ParticipantSetup } from "@/components/chat/ParticipantSetup";
import { useChat } from "@/hooks/useChat";
import { useIdentity } from "@/hooks/useIdentity";
import { usePresence } from "@/hooks/usePresence";

export default function Home() {
  const { identity, isReady, join } = useIdentity();
  const { messages, sendMessage, connectionStatus, isSending, error, retry } = useChat(identity);
  const presence = usePresence(identity);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conversation">Skip to conversation</a>
      <aside className="sidebar" aria-label="Workshop workspace">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">t<span>c</span></span>
          <div><span className="brand-name">Team Chat<span className="brand-dot">.</span></span><span className="brand-caption">THE COLLABORATION LAB</span></div>
        </div>
        <div className="workspace-label"><span>WORKSPACE</span><span className="workspace-key" aria-hidden="true">01</span></div>
        <nav aria-label="Channels">
          <a className="channel-link" href="#conversation" aria-current="page"><span aria-hidden="true">#</span> team-chat <span className="channel-dot" aria-hidden="true" /></a>
        </nav>
        <div className="sidebar-note">
          <span className="note-illustration" aria-hidden="true">↗</span>
          <h2>Small commits.<br />Great teamwork.</h2>
          <p>A place to try, review,<br />and build together.</p>
          <span className="workshop-tag">GIT × GITHUB WORKSHOP</span>
        </div>
        <div className="sidebar-bottom">
          <div className="local-profile"><span className="profile-avatar" aria-hidden="true">{identity ? Array.from(identity.displayName)[0]?.toLocaleUpperCase("en-US") : "Y"}</span><div><strong>{identity?.displayName ?? "Join the workshop"}</strong><span>Shared workshop room</span></div></div>
          <p>Built for learning. Made by your team.</p>
        </div>
      </aside>

      <main className="main-workspace" id="conversation">
        <div className="workspace-topbar"><p>Workspace <span aria-hidden="true">/</span> <strong>Team Chat Lab</strong></p><span className="workshop-pill">WORKSHOP EDITION</span></div>
        <section className="chat-panel" aria-label="Shared team chat">
          <ChatHeader />
          <div className="chat-toolbar"><div className="conversation-tab"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>Conversation</div><MessageSearch /></div>
          <div className="demo-notice"><span className="notice-icon" aria-hidden="true">i</span><p>This public workshop room is shared with everyone here. Messages remain after refresh. Please keep personal information out of the conversation.</p></div>
          <OnlineParticipants presence={presence} currentClientId={identity?.clientId ?? null} />
          <MessageList messages={messages} currentClientId={identity?.clientId ?? null} isLoading={connectionStatus !== "connected" && messages.length === 0} />
          {error && <div className="chat-error" role="alert"><p>{error}</p>{connectionStatus === "reconnecting" && <button type="button" onClick={retry}>Reconnect</button>}</div>}
          {!isReady ? <p className="identity-loading" role="status">Opening your workshop session…</p> : identity ? <MessageComposer onSend={sendMessage} isSending={isSending} /> : <ParticipantSetup onJoin={join} />}
          <footer className="chat-footer"><ChatStats messageCount={messages.length} connectionStatus={connectionStatus} /><span className="time-zone-note">Times in UTC</span><BuildInfo /></footer>
        </section>
        <p className="workspace-footnote">One issue. One branch. One step forward.</p>
      </main>
    </div>
  );
}
