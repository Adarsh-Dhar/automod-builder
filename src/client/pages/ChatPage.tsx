import React from 'react';
import ChatMode from '../components/ChatMode';
import type { ChatMessage } from '../types';

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
  const [subredditName, setSubredditName] = React.useState<string>('');

  const currentConversation = conversations.find((conversation) => conversation.id === activeConversation) ?? conversations[0];

  const openConversation = (id: string) => {
    setActiveConversation(id);
    setShowConversations(false);
  };

  React.useEffect(() => {
    let isActive = true;

    const loadInit = async () => {
      try {
        const response = await fetch('/api/init');
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { subredditName?: string };
        if (isActive) {
          setSubredditName(data.subredditName ?? '');
        }
      } catch (error) {
        console.warn('Failed to load subreddit init data', error);
      }
    };

    void loadInit();

    return () => {
      isActive = false;
    };
  }, []);

  // Chat messages shaped for ChatMode: { id, role: 'user'|'assistant', content, timestamp }
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>(() =>
    messages.map((m) => ({ id: m.id, role: (m.me ? 'user' : 'assistant') as 'user' | 'assistant', content: m.text, timestamp: Date.now() }))
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
    <div className="min-h-screen bg-[#F4F2F7] px-3 py-4 sm:px-6 lg:p-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-4xl bg-transparent p-0 sm:p-3 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
            <aside className="hidden rounded-[28px] bg-[#1A1020] p-5 text-white shadow-xl lg:col-span-3 lg:block">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#F5C842] flex items-center justify-center">
                  <span className="text-[#1A1020] text-lg font-bold">✳</span>
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight">ChaTin</div>
                  <div className="text-xs text-white/50">AI Chatbot</div>
                </div>
              </div>

              <button className="mt-5 w-full flex items-center justify-between bg-[#F5C842] hover:bg-[#e6b93c] text-[#1A1020] font-semibold px-4 py-3 rounded-[14px] text-sm transition-colors">
                New Chat
                <span className="w-6 h-6 rounded-full bg-[#1A1020] flex items-center justify-center text-[#F5C842] text-xs">→</span>
              </button>

              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Chat history</span>
                  <button className="text-xs text-white/50 hover:text-white">See All</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['What is a wild animal?', 'Give an example', 'Meaning of white rose', 'UI/UX'].map((tag) => (
                    <button key={tag} className="text-xs bg-white/8 hover:bg-white/12 text-white/70 px-3 py-1.5 rounded-full transition-colors">{tag}</button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Popular Prompt</span>
                  <button className="text-xs text-white/50 hover:text-white">See All</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#FCEEF5] rounded-[16px] p-3 flex flex-col justify-between min-h-[110px]">
                    <p className="text-xs font-semibold text-[#1A1020] leading-snug">Explain about Sushi Roll receipt</p>
                    <div>
                      <p className="text-[10px] text-[#1A1020]/50 mt-2">Generate by Kanny.low</p>
                      <button className="mt-2 w-full text-xs bg-white text-[#1A1020] font-medium py-1.5 rounded-full">Use this prompt</button>
                    </div>
                  </div>
                  <div className="bg-[#E8F8EC] rounded-[16px] p-3 flex flex-col justify-between min-h-[110px]">
                    <p className="text-xs font-semibold text-[#1A1020] leading-snug">Give the best resolution for 2024</p>
                    <div>
                      <p className="text-[10px] text-[#1A1020]/50 mt-2">Generate by Jon jenny</p>
                      <button className="mt-2 w-full text-xs bg-white text-[#1A1020] font-medium py-1.5 rounded-full">Use this prompt</button>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <section className="hidden overflow-hidden rounded-[28px] bg-white shadow-md lg:col-span-3 lg:block">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-bold text-[#1A1020] text-base mb-3">Explore knowledge<br/>with AI chat</h2>
                <input
                  className="w-full rounded-full border border-gray-200 bg-[#F4F2F7] px-4 py-2 text-sm outline-none focus:border-[#F5C842] placeholder:text-gray-400"
                  placeholder="Search..."
                />
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

            <main className="flex min-h-136 flex-col rounded-[28px] bg-white p-0 shadow-2xl overflow-hidden lg:col-span-6">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <button className="w-9 h-9 rounded-full bg-[#F4F2F7] flex items-center justify-center text-[#1A1020]">
                  ☰
                </button>
                <button className="flex items-center gap-2 bg-[#F4F2F7] px-4 py-2 rounded-full text-sm font-semibold text-[#1A1020]">
                  Chatin 1.4
                  <span className="text-gray-400">▾</span>
                </button>
                <button className="w-9 h-9 rounded-full bg-[#F4F2F7] flex items-center justify-center text-[#1A1020]">
                  ✏️
                </button>
              </div>

              <div className="px-5 pt-5">
                <h1 className="text-[22px] font-bold text-[#1A1020] leading-tight">{currentConversation?.title ?? 'New Conversation'}</h1>
              </div>

              <div className="flex-1 p-0">
                <ChatMode
                  ast={[]}
                  messages={chatMessages}
                  onAddMessage={(m) => handleAddChatMessage(m)}
                  onApplyAST={() => {}}
                  onApplyYaml={(yaml) => handleApplyYaml(yaml)}
                  subredditName={subredditName}
                />
              </div>
            </main>
            {/* right aside removed to match ChaTin 3-column layout */}
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
