import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getTitle } from '@/lib/titles'
import type { AdkSessionSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

function sessionLabel(session: AdkSessionSummary): string {
  return (
    getTitle(session.id) ??
    new Date((session.lastUpdateTime ?? 0) * 1000).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
  )
}

export function Sidebar({
  sessions,
  activeId,
  onNew,
  onSelect,
  onDelete
}: {
  sessions: AdkSessionSummary[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between p-3">
        <span className="px-1 text-sm font-semibold">SNUC Agent</span>
        <Button size="icon" variant="ghost" onClick={onNew} aria-label="New chat">
          <PlusIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center rounded-md hover:bg-sidebar-accent',
                session.id === activeId && 'bg-sidebar-accent'
              )}
            >
              <button
                onClick={() => onSelect(session.id)}
                className="flex-1 truncate px-2 py-2 text-left text-sm"
                title={sessionLabel(session)}
              >
                {sessionLabel(session)}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="mr-1 size-7 opacity-0 group-hover:opacity-100"
                aria-label="Delete chat"
                onClick={() => setPendingDelete(session.id)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet.</p>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and its history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete)
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
