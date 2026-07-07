import { Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { BootScreen } from '@/components/BootScreen'
import { ChatThread } from '@/components/ChatThread'
import { Composer } from '@/components/Composer'
import { Sidebar } from '@/components/Sidebar'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

import { Button } from '@/components/ui/button'
import { useAdkBoot } from '@/hooks/use-adk-boot'
import { useChat } from '@/hooks/use-chat'
import { useSessions } from '@/hooks/use-sessions'
import { checkHealth } from '@/lib/adk-client'
import { onBackendDown } from '@/lib/backend-status'
import { API_BASE } from '@/lib/config'
import { SettingsDialog } from './components/SettingsDialog'

function App(): React.JSX.Element {
  const { sessions, refresh, create, remove } = useSessions()
  const chat = useChat()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [uiLoad,setuiLoad] = useState(true)
  const [showModelConfig,setModelConfig] = useState(false)
  const adkStatus = useAdkBoot()

  // Only start the config-check + backendDown wiring once ADK answers
  // /health — before that, readConfig() would race a server that isn't
  // listening yet.
  useEffect(function() {
     if (adkStatus !== 'ready') return
     onBackendDown(() => setBackendDown(true))
     window.api.readConfig().then(function() {
        setuiLoad(false)
        setModelConfig(false)
     }).catch(function() {
        setuiLoad(false)
        setModelConfig(true)
     })
  }, [adkStatus])

  // Same reasoning: fetching the session list before ADK is up would fail
  // immediately and spuriously trip the "backend down" dialog during normal
  // startup.
  useEffect(() => {
    if (adkStatus !== 'ready') return
    refresh()
  }, [adkStatus, refresh])

  useEffect(
    () =>
      window.api.onDownloadDone((info) => {
        if (info.state === 'completed') toast.success(`Saved ${info.file}`)
        else if (info.state === 'cancelled') toast.info('Download cancelled')
        else toast.error(`Download of ${info.file} failed`)
      }),
    []
  )

  const handleRetry = async (): Promise<void> => {
    setRetrying(true)
    const ok = await checkHealth()
    setRetrying(false)
    if (ok) {
      setBackendDown(false)
      refresh()
    } else {
      toast.error('Still unreachable. Is the ADK API server running?')
    }
  }

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
        if ((e as Error).name !== 'BackendDownError') toast.error((e as Error).message)
        return
      }
      setActiveId(id)
    }
    await chat.send(id, text)
    refresh()
  }
  if (adkStatus === 'starting') {
    return <BootScreen title="Waiting for ADK to be ready…" />
  }

  if (adkStatus === 'failed') {
    return (
      <BootScreen
        title="Couldn't start the backend"
        subtitle="Sorry about that — the ADK server didn't respond in time. You can quit and try again."
        spinner={false}
        action={<Button onClick={() => window.api.quitApp()}>Quit</Button>}
      />
    )
  }

  if (uiLoad) {
    return <BootScreen title="Initializing…" />
  } else {
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <SettingsDialog open={showModelConfig} setOpen={setModelConfig} onNoConfig={true} />
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

        {/* Controlled and without any cancel action, so it cannot be dismissed
            until the backend is reachable again. */}
        <AlertDialog open={backendDown}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Backend unavailable</AlertDialogTitle>
              <AlertDialogDescription>
                The SNUC Agent backend (ADK API server) isn&apos;t reachable at {API_BASE}. Start it
                with <code className="font-mono text-xs">adk api_server</code> and try again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button onClick={handleRetry} disabled={retrying}>
                {retrying && <Loader2Icon className="animate-spin" />}
                Try Again
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    ) 
  }
}

export default App
