import React from 'react';
import ChatMode from '../components/ChatMode';

type Message = { id: string; author: string; text: string; time?: string; me?: boolean };
type Conversation = { id: string; title: string; last: string; unread?: number };

const conversations: Conversation[] = [
  { id: '1', title: 'General', last: '', unread: 0 },
  { id: '2', title: 'Moderation', last: '', unread: 0 },
  { id: '3', title: 'Design', last: '', unread: 0 },
  { id: '4', title: 'Random', last: '', unread: 0 },
];

const messages: Message[] = [];

export function ChatPage() {
  const [showConversations, setShowConversations] = React.useState(false);
  const [activeConversation, setActiveConversation] = React.useState<string | null>(conversations[0]?.id ?? null);

  const currentConversation = conversations.find((conversation) => conversation.id === activeConversation) ?? conversations[0];

  const openConversation = (id: string) => {
    setActiveConversation(id);
    setShowConversations(false);
  };

  // Gemini API key loaded from environment (Vite .env via VITE_GEMINI_API_KEY)
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY ?? '';
  const [geminiApiKey, setGeminiApiKey] = React.useState<string>(envKey);

  // Chat messages shaped for ChatMode: { id, role: 'user'|'assistant', content, timestamp }
  const [chatMessages, setChatMessages] = React.useState(() =>
    messages.map((m) => ({ id: m.id, role: m.me ? 'user' : 'assistant', content: m.text, timestamp: Date.now() }))
  );

  const handleAddChatMessage = (msg: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number }) => {
    setChatMessages((s) => [...s, msg]);
  };

  const handleApplyYaml = (yaml: string) => {
    // placeholder: integrate with the code editor / AST in full app
    console.info('Apply YAML from ChatMode:', yaml.slice(0, 200));
  };

  // API key is sourced from environment; no UI modal to save keys.

  return (
    <div className="min-h-screen bg-linear-to-br from-[#efe9ff] via-[#f3f1ff] to-[#eef5ff] px-3 py-4 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-4xl bg-transparent p-0 sm:p-3 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
            <aside className="hidden rounded-2xl bg-linear-to-b from-[#1F0E2C] to-[#2C163E] p-4 text-white shadow-xl lg:col-span-3 lg:block">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-sm bg-[#FF6B6B]" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Attmosfire</div>
                  <div className="text-xs text-white/60">Available for work</div>
                </div>
              </div>

              <nav className="space-y-2 mt-4">
                <button className="w-full text-left px-3 py-2 rounded-md bg-white/6 flex items-center justify-between">All</button>
                <button className="w-full text-left px-3 py-2 rounded-md hover:bg-white/4">Assigned to Me</button>
                <button className="w-full text-left px-3 py-2 rounded-md hover:bg-white/4">Unassigned</button>
                <button className="w-full text-left px-3 py-2 rounded-md hover:bg-white/4">Blocked</button>
              </nav>

              <div className="mt-6 bg-white/6 p-3 rounded-2xl">
                <div className="text-xs text-white/60">Pro Plan</div>
                <div className="mt-2 font-semibold text-white">$189 / month</div>
                <button className="mt-3 w-full bg-white text-[#2c163e] rounded-full py-2 text-sm">Get Pro Plan</button>
              </div>
            </aside>

            <section className="hidden overflow-hidden rounded-2xl bg-white p-3 shadow-md lg:col-span-3 lg:block">
              <div className="px-2 py-2 border-b">
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Search" />
              </div>
              <div className="mt-3 space-y-2 overflow-auto p-2 lg:h-140">
                {conversations.map((c) => (
                  <div key={c.id} className={`flex cursor-pointer items-center justify-between rounded-lg p-3 hover:bg-slate-50 ${activeConversation === c.id ? 'bg-slate-50' : ''}`} onClick={() => openConversation(c.id)}>
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-slate-500">{c.last}</div>
                    </div>
                    {c.unread ? <div className="text-xs bg-purple-500 text-white rounded-full px-2 py-1">{c.unread}</div> : null}
                  </div>
                ))}
              </div>
            </section>

            <main className="flex min-h-136 flex-col rounded-3xl bg-white p-4 shadow-2xl sm:p-6 lg:col-span-4">
              <div className="flex items-center gap-3 border-b pb-4 sm:gap-4">
                <button
                  className="mr-1 inline-flex items-center justify-center rounded-md bg-slate-100 p-2 text-slate-700 lg:hidden"
                  onClick={() => setShowConversations(true)}
                  aria-label="Open conversations"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="w-12 h-12 rounded-full bg-slate-100/60 flex items-center justify-center">A</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{currentConversation?.title ?? 'Conversation'}</div>
                  <div className="text-xs text-slate-700">Active now</div>
                </div>
                <div className="shrink-0 text-xs text-slate-500 sm:text-sm">Oct 12, 2022</div>
              </div>

              <div className="flex-1 p-0">
                <ChatMode
                  ast={[]}
                  messages={chatMessages}
                  onAddMessage={(m) => handleAddChatMessage(m)}
                  onApplyAST={() => {}}
                  onApplyYaml={(yaml) => handleApplyYaml(yaml)}
                  geminiApiKey={geminiApiKey}
                />
              </div>
            </main>

            <aside className="rounded-2xl bg-white p-4 shadow-md lg:col-span-2 hidden lg:block">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">General info</div>
                  <div className="font-medium">Mary Franci</div>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">M</div>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                <p>Email: mary_franci@gmail.com</p>
                <p className="mt-2">Date Created: Oct 12, 2022</p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Mobile conversation overlay */}
      {showConversations && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConversations(false)} />
          <div className="relative h-full w-[92vw] max-w-sm overflow-auto bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold">Conversations</div>
              <button onClick={() => setShowConversations(false)} className="text-slate-600">Close</button>
            </div>
            <div className="space-y-2">
              {conversations.map((c) => (
                <div key={c.id} className={`cursor-pointer rounded-lg p-3 hover:bg-slate-50 ${activeConversation === c.id ? 'bg-slate-50' : ''}`} onClick={() => openConversation(c.id)}>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.last}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ApiKeyModal removed — API key is sourced from environment */}
    </div>
  );
}

export default ChatPage;
