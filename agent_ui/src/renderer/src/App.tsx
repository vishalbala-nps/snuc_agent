import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ChatThread } from '@/components/ChatThread'
import { Composer } from '@/components/Composer'
import { Sidebar } from '@/components/Sidebar'
import { useChat } from '@/hooks/use-chat'
import { useSessions } from '@/hooks/use-sessions'

function App(): React.JSX.Element {
  const { sessions, refresh, create, remove } = useSessions()
  const chat = useChat()
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(
    () =>
      window.api.onDownloadDone((info) => {
        if (info.state === 'completed') toast.success(`Saved ${info.file}`)
        else if (info.state === 'cancelled') toast.info('Download cancelled')
        else toast.error(`Download of ${info.file} failed`)
      }),
    []
  )

  const handleNew = (): void => {
    if (chat.streaming) return
    setActiveId(null)
    chat.clear()
  }

  const handleSelect = (id: string): void => {
    if (id === activeId || chat.streaming) return
    setActiveId(id)
    chat.loadSession(id)
  }

  const handleDelete = async (id: string): Promise<void> => {
    await remove(id)
    if (id === activeId) {
      setActiveId(null)
      chat.clear()
    }
  }

  const handleSend = async (text: string): Promise<void> => {
    let id = activeId
    if (!id) {
      try {
        id = (await create()).id
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
      setActiveId(id)
    }
    await chat.send(id, text)
    refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onNew={handleNew}
        onSelect={handleSelect}
        onDelete={handleDelete}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatThread messages={chat.messages} loading={chat.loading} />
        <Composer streaming={chat.streaming} onSend={handleSend} onStop={chat.stop} />
      </main>
    </div>
  )
}

export default App
