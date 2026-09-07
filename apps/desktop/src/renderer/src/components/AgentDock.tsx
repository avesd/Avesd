import type {
  AgentConnectionStatus,
  AgentEvent,
  AgentService,
} from "@avesd/plugin-api";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

interface Message {
  readonly id: number;
  readonly role: "agent" | "user";
  readonly text: string;
}

const statusLabels: Record<AgentConnectionStatus, string> = {
  connected: "Ready",
  connecting: "Connecting",
  disconnected: "Offline",
  error: "Unavailable",
};

export const AgentDock = ({ service }: { readonly service: AgentService }) => {
  const nextMessageId = useRef(0);
  const [activity, setActivity] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AgentConnectionStatus>("disconnected");

  useEffect(() => {
    const dispose = service.subscribe((event: AgentEvent) => {
      if (event.type === "status") {
        setStatus(event.status);
        setError(event.status === "error" ? event.message ?? "Codex could not connect." : undefined);
        if (event.status === "error" || event.status === "disconnected") {
          setBusy(false);
        }
        return;
      }
      if (event.type === "activity") {
        setActivity(event.title);
        return;
      }
      if (event.type === "turnComplete") {
        setActivity(undefined);
        setBusy(false);
        return;
      }

      setMessages((current) => {
        const last = current.at(-1);
        if (last?.role === "agent") {
          return [
            ...current.slice(0, -1),
            { ...last, text: last.text + event.text },
          ];
        }

        return [
          ...current,
          { id: nextMessageId.current++, role: "agent", text: event.text },
        ];
      });
    });

    return () => {
      void dispose();
    };
  }, [service]);

  const connect = async (): Promise<void> => {
    if (status === "connected" || status === "connecting") {
      return;
    }

    setError(undefined);
    try {
      await service.connect();
    } catch {
      setError((current) => current ?? "Codex could not connect.");
    }
  };

  const openPanel = (): void => {
    setOpen(true);
    void connect();
  };

  const sendPrompt = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || busy) {
      return;
    }

    setDraft("");
    setError(undefined);
    setActivity(undefined);
    setBusy(true);
    setMessages((current) => [
      ...current,
      { id: nextMessageId.current++, role: "user", text },
      { id: nextMessageId.current++, role: "agent", text: "" },
    ]);

    try {
      await service.prompt(text);
    } catch {
      setBusy(false);
      setError((current) => current ?? "Codex could not complete that request.");
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void sendPrompt();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
    }
  };

  if (!open) {
    return (
      <button
        aria-expanded="false"
        aria-label="Open Codex"
        className="agent-launcher"
        onClick={openPanel}
        type="button"
      >
        <span aria-hidden="true" className="agent-mark">A</span>
        <span className={`agent-status-dot is-${status}`} />
      </button>
    );
  }

  return (
    <section aria-label="Codex agent" className="agent-panel" role="dialog">
      <header className="agent-header">
        <span aria-hidden="true" className="agent-mark is-small">A</span>
        <div className="agent-identity">
          <strong>Codex</strong>
          <span>{statusLabels[status]}</span>
        </div>
        <button
          aria-label="Close Codex"
          className="agent-icon-button"
          onClick={() => setOpen(false)}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div aria-live="polite" className="agent-conversation">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <span aria-hidden="true" className="agent-empty-glyph">✦</span>
            <h2>What are we working on?</h2>
            <p>Codex is connected locally in read-only mode for this first version.</p>
          </div>
        ) : messages.map((message) => (
          <div className={`agent-message is-${message.role}`} key={message.id}>
            {message.text || <span className="agent-thinking"><i /><i /><i /></span>}
          </div>
        ))}
        {activity ? <p className="agent-activity">{activity}</p> : null}
      </div>

      {error ? (
        <div className="agent-error" role="alert">
          <span>{error}</span>
          <button onClick={() => void connect()} type="button">Retry</button>
        </div>
      ) : null}

      <form className="agent-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="Message Codex"
          disabled={status === "connecting"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={status === "connecting" ? "Connecting to Codex…" : "Ask Codex…"}
          rows={1}
          value={draft}
        />
        {busy ? (
          <button
            aria-label="Stop Codex"
            className="agent-send is-stop"
            onClick={() => void service.cancel()}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        ) : (
          <button
            aria-label="Send message"
            className="agent-send"
            disabled={!draft.trim() || status === "connecting"}
            type="submit"
          >
            <span aria-hidden="true">↑</span>
          </button>
        )}
      </form>
    </section>
  );
};
