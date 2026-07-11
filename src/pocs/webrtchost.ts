// /src/webrtchost.ts
// LilPOS WebRTC browser-to-browser chat POC
// Route target: http://localhost:8081/webrtchost
//
// Browser-only limitations:
// - No real UDP/TCP port binding from browser.
// - The "port" prompt below is a room/station code for this test.
// - Manual offer/answer copy-paste is used for signaling.
// - Once paired, chat messages travel over WebRTC DataChannel.

export {};
alert("WebRTC test page loaded");
type SignalPayload = RTCSessionDescriptionInit;

type ChatMessage = {
  id: string;
  from: string;
  roomCode: string;
  text: string;
  createdAt: string;
};

const app = document.getElementById("app") ?? document.body;

const roomCode = window.prompt("Enter a unique LilPOS test port / room code:", "8081") || "8081";
const stationName =
  window.prompt("Enter station name:", `Station-${Math.floor(Math.random() * 1000)}`) ||
  `Station-${Math.floor(Math.random() * 1000)}`;

let peer: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;

const iceServers: RTCConfiguration = {
  iceServers: [],
};

function uid(): string {
  return `${stationName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now(): string {
  return new Date().toLocaleTimeString();
}

function renderWebRtcTest(): void {
      app.innerHTML = `
    <div style="font-family: system-ui, Arial; padding: 20px; max-width: 1100px; margin: 0 auto;">
      <h1>LilPOS WebRTC Test</h1>
      <p>
        <b>Station:</b> ${escapeHtml(stationName)}
        &nbsp; | &nbsp;
        <b>Room Code:</b> ${escapeHtml(roomCode)}
        &nbsp; | &nbsp;
        <b>Status:</b> <span id="status">Not connected</span>
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px;">
        <section style="border: 1px solid #ccc; border-radius: 10px; padding: 14px;">
          <h2>Host / Station 1</h2>
          <button id="createOffer">Create Offer</button>
          <textarea id="offerOut" rows="10" style="width:100%; margin-top:10px;" placeholder="Offer will appear here"></textarea>

          <h3>Paste Answer From Station 2</h3>
          <textarea id="answerIn" rows="10" style="width:100%;" placeholder="Paste answer here"></textarea>
          <button id="acceptAnswer">Accept Answer</button>
        </section>

        <section style="border: 1px solid #ccc; border-radius: 10px; padding: 14px;">
          <h2>Join / Station 2</h2>
          <h3>Paste Offer From Station 1</h3>
          <textarea id="offerIn" rows="10" style="width:100%;" placeholder="Paste offer here"></textarea>
          <button id="createAnswer">Create Answer</button>

          <h3>Copy Answer Back To Station 1</h3>
          <textarea id="answerOut" rows="10" style="width:100%; margin-top:10px;" placeholder="Answer will appear here"></textarea>
        </section>
      </div>

      <section style="border: 1px solid #ccc; border-radius: 10px; padding: 14px; margin-top: 18px;">
        <h2>Chat</h2>
        <div id="messages" style="height: 260px; overflow:auto; background:#111827; color:#e5e7eb; padding:12px; border-radius:8px; margin-bottom:10px;"></div>
        <div style="display:flex; gap:8px;">
          <input id="chatInput" style="flex:1; padding:10px;" placeholder="Type a test message..." />
          <button id="sendMessage">Send</button>
        </div>
      </section>
    </div>
  `;

  bind();
}

function bind(): void {
  document.getElementById("createOffer")?.addEventListener("click", createOffer);
  document.getElementById("acceptAnswer")?.addEventListener("click", acceptAnswer);
  document.getElementById("createAnswer")?.addEventListener("click", createAnswer);
  document.getElementById("sendMessage")?.addEventListener("click", sendChatMessage);

  document.getElementById("chatInput")?.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      sendChatMessage();
    }
  });
}

function createPeer(): RTCPeerConnection {
  const pc = new RTCPeerConnection(iceServers);

  pc.oniceconnectionstatechange = () => {
    setStatus(`ICE: ${pc.iceConnectionState}`);
  };

  pc.onconnectionstatechange = () => {
    setStatus(`Peer: ${pc.connectionState}`);
  };

  pc.ondatachannel = (event) => {
    setupChannel(event.channel);
  };

  return pc;
}

async function createOffer(): Promise<void> {
  peer = createPeer();

  channel = peer.createDataChannel(`lilpos-room-${roomCode}`);
  setupChannel(channel);

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGathering(peer);

  const out = document.getElementById("offerOut") as HTMLTextAreaElement | null;
  if (out && peer.localDescription) {
    out.value = JSON.stringify(peer.localDescription);
  }

  setStatus("Offer created. Copy it to Station 2.");
}

async function createAnswer(): Promise<void> {
  const offerText = (document.getElementById("offerIn") as HTMLTextAreaElement | null)?.value.trim();
  if (!offerText) {
    alert("Paste the Station 1 offer first.");
    return;
  }

  const offer = JSON.parse(offerText) as SignalPayload;

  peer = createPeer();
  await peer.setRemoteDescription(offer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceGathering(peer);

  const out = document.getElementById("answerOut") as HTMLTextAreaElement | null;
  if (out && peer.localDescription) {
    out.value = JSON.stringify(peer.localDescription);
  }

  setStatus("Answer created. Copy it back to Station 1.");
}

async function acceptAnswer(): Promise<void> {
  if (!peer) {
    alert("Create an offer first.");
    return;
  }

  const answerText = (document.getElementById("answerIn") as HTMLTextAreaElement | null)?.value.trim();
  if (!answerText) {
    alert("Paste the Station 2 answer first.");
    return;
  }

  const answer = JSON.parse(answerText) as SignalPayload;
  await peer.setRemoteDescription(answer);

  setStatus("Answer accepted. Waiting for data channel...");
}

function setupChannel(dc: RTCDataChannel): void {
  channel = dc;

  channel.onopen = () => {
    setStatus("Connected");
    addMessage({
      id: uid(),
      from: "System",
      roomCode,
      text: "WebRTC channel is open.",
      createdAt: now(),
    });
  };

  channel.onclose = () => {
    setStatus("Closed");
  };

  channel.onerror = () => {
    setStatus("Data channel error");
  };

  channel.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as ChatMessage;
      addMessage(msg);
    } catch {
      addMessage({
        id: uid(),
        from: "Remote",
        roomCode,
        text: String(event.data),
        createdAt: now(),
      });
    }
  };
}

function sendChatMessage(): void {
  const input = document.getElementById("chatInput") as HTMLInputElement | null;
  const text = input?.value.trim();

  if (!text) return;

  if (!channel || channel.readyState !== "open") {
    alert("WebRTC channel is not open yet.");
    return;
  }

  const msg: ChatMessage = {
    id: uid(),
    from: stationName,
    roomCode,
    text,
    createdAt: now(),
  };

  channel.send(JSON.stringify(msg));
  addMessage(msg);

  if (input) input.value = "";
}

function addMessage(msg: ChatMessage): void {
  const messages = document.getElementById("messages");
  if (!messages) return;

  const row = document.createElement("div");
  row.style.marginBottom = "8px";
  row.innerHTML = `
    <div>
      <b>${escapeHtml(msg.from)}</b>
      <small style="opacity:.75;">${escapeHtml(msg.createdAt)} | room ${escapeHtml(msg.roomCode)}</small>
    </div>
    <div>${escapeHtml(msg.text)}</div>
  `;

  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

function setStatus(text: string): void {
  const status = document.getElementById("status");
  if (status) status.textContent = text;
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 1500);

    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char] || char;
  });
}

renderWebRtcTest();