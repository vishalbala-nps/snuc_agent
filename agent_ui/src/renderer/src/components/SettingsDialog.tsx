import { Loader2Icon, SettingsIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSession, deleteSession, getSession, updateState } from '@/lib/adk-client'

// "user:" state keys persist user-wide, but the ADK endpoints for reading and
// writing state are session-scoped — so run each operation through a
// throwaway session.
async function withTempSession<T>(fn: (sessionId: string) => Promise<T>): Promise<T> {
  const id = (await createSession()).id
  try {
    return await fn(id)
  } finally {
    await deleteSession(id).catch(() => {})
  }
}

async function loadToken(): Promise<string> {
  try {
    return await withTempSession(async (id) => {
      const token = (await getSession(id)).state['user:DIGIICAMPUS_TOKEN']
      return typeof token === 'string' ? token : ''
    })
  } catch {
    return ''
  }
}

async function saveToken(token: string): Promise<void> {
  await withTempSession((id) => updateState(id, { 'user:DIGIICAMPUS_TOKEN': token }))
}

export function SettingsDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch the stored token only when the dialog opens; the password input
  // keeps it masked.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    loadToken().then((existing) => {
      if (cancelled) return
      setToken(existing)
      setSavedToken(existing)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const save = async (): Promise<void> => {
    const trimmed = token.trim()
    if (!trimmed || trimmed === savedToken) return
    setSaving(true)
    try {
      await saveToken(trimmed)
      toast.success('Digiicampus token saved')
      setOpen(false)
    } catch (e) {
      if ((e as Error).name !== 'BackendDownError') toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <SettingsIcon className="size-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Credentials the agent uses to reach the university portals.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="digiicampus-token">Digiicampus token</Label>
          <div className="relative">
            <Input
              id="digiicampus-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={loading ? '' : 'Paste your Auth-Token (JWT)'}
              disabled={loading}
              autoComplete="off"
              className="pr-8"
            />
            {loading && (
              <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Saved as user state, so it applies to every chat.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={loading || saving || !token.trim() || token.trim() === savedToken}
          >
            {saving && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
