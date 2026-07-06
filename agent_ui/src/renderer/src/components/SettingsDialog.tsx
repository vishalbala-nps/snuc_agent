import { Loader2Icon, SettingsIcon } from 'lucide-react'
import { useState } from 'react'

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

export function SettingsDialog({
  onSaveToken
}: {
  onSaveToken: (token: string) => Promise<void>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    const trimmed = token.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onSaveToken(trimmed)
      setToken('')
      setOpen(false)
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
          <Input
            id="digiicampus-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your Auth-Token (JWT)"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Saved as user state, so it applies to every chat. Leave blank to keep the current
            token.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={!token.trim() || saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
